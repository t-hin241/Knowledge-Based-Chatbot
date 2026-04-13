from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from datetime import datetime, timezone, date, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from pathlib import Path

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.models.chat import Message, ChatSession
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UpdateMeRequest,
    UsageStatsResponse,
    DayStats,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Create a new user account and return tokens immediately
    so the client is logged in right after sign-up.
    """
    # Check for duplicates in a single query (more efficient than two queries)
    result = await db.execute(
        select(User).where(
            (User.email == body.email) | (User.username == body.username)
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Tell the client which field is taken without exposing other user data
        field = "email" if existing.email == body.email else "username"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An account with this {field} already exists",
        )

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()   # writes to DB but doesn't commit yet — gets us the user.id

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )
    # session.commit() is called automatically by the get_db dependency


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchange email + password for a JWT pair.
    Uses a constant-time comparison to prevent timing attacks.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Always call verify_password even if user is None — this ensures
    # the response time is the same whether the user exists or not,
    # preventing email enumeration via timing.
    dummy_hash = "$2b$12$KIX9zp4JieCnb4b3GsKXK.c7RqWmFnjSQ6zOOZtI5yWq5wy1OMH.2"
    password_ok = verify_password(
        body.password,
        user.hashed_password if user else dummy_hash,
    )

    if not user or not password_ok or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)):
    """
    Return the currently authenticated user's profile.
    This route is a good integration test — if it works,
    your entire auth stack is wired up correctly.
    """
    return MeResponse(user=UserResponse.model_validate(current_user))


@router.patch("/me", response_model=MeResponse)
async def update_me(
    body: UpdateMeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.username:
        current_user.username = body.username.lower()
    if body.email:
        current_user.email = body.email

    if body.new_password:
        if not body.current_password or not verify_password(
            body.current_password, current_user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect current password",
            )
        current_user.hashed_password = hash_password(body.new_password)
    
    if body.plan:
        current_user.plan = body.plan

    db.add(current_user)
    await db.flush()
    return MeResponse(user=UserResponse.model_validate(current_user))


@router.post("/avatar", response_model=MeResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload and set a personal avatar for the user.
    """
    # ── Validate file type ────────────────────────────────────────────────
    suffix = Path(file.filename or "").suffix.lower()
    allowed_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    if suffix not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{suffix}'. Use JPG, PNG, GIF, or WEBP.",
        )

    # ── Save to disk ──────────────────────────────────────────────────────
    upload_dir = Path(settings.UPLOAD_DIR) / str(current_user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"avatar_{uuid.uuid4()}{suffix}"
    file_path = upload_dir / unique_name
    
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit for avatars
        raise HTTPException(status_code=413, detail="Avatar too large. Max 5MB.")

    file_path.write_bytes(content)

    # ── Update DB ─────────────────────────────────────────────────────────
    # We store the relative path (including user folder)
    relative_path = f"{current_user.id}/{unique_name}"
    
    # Optional: Delete old avatar file if it exists
    if current_user.avatar_url:
        old_path = Path(settings.UPLOAD_DIR) / current_user.avatar_url
        if old_path.exists():
            old_path.unlink()

    current_user.avatar_url = relative_path
    db.add(current_user)
    await db.flush()
    
    return MeResponse(user=UserResponse.model_validate(current_user))


@router.get("/usage", response_model=UsageStatsResponse)
async def get_usage(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Calculate daily active minutes for the last 7 days
    today = date.today()
    start_date = today - timedelta(days=6)

    # Fetch all message timestamps for user's sessions in the range
    result = await db.execute(
        select(Message.created_at)
        .join(ChatSession)
        .where(
            ChatSession.user_id == current_user.id,
            Message.created_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
        )
        .order_by(Message.created_at)
    )
    ts_list = result.scalars().all()

    # Group by day and calculate duration via clustering
    # Cluster = messages within 20 minute gaps
    THRESHOLD = timedelta(minutes=20)
    BUFFER_SEC = 300  # 5 minute activity bonus per cluster
    
    day_maps: dict[date, list[datetime]] = {}
    for ts in ts_list:
        d = ts.date()
        if d not in day_maps: day_maps[d] = []
        day_maps[d].append(ts)

    usage = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        day_ts = day_maps.get(d, [])
        
        minutes = 0
        if day_ts:
            day_sec = 0
            c_start = day_ts[0]
            c_last  = day_ts[0]
            for t in day_ts[1:]:
                if t - c_last > THRESHOLD:
                    day_sec += (c_last - c_start).total_seconds() + BUFFER_SEC
                    c_start = t
                c_last = t
            day_sec += (c_last - c_start).total_seconds() + BUFFER_SEC
            minutes = int(day_sec // 60)

        usage.append(DayStats(date=d.isoformat(), total_minutes=minutes))

    return UsageStatsResponse(usage=usage)