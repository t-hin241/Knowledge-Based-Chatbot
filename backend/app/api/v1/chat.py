"""
Chat routes — SSE streaming endpoint + session/history management.

Key architecture decision on DB sessions:
- The route's injected `db` (from get_db) is used ONLY for pre-stream work:
  creating the session, saving the user message, loading history.
- FastAPI closes that session the moment EventSourceResponse is returned.
- The event_generator opens its OWN AsyncSessionLocal for saving the
  assistant message — this session lives for the duration of the stream.
"""
import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone, date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.dependencies import get_current_user
from app.db.session import AsyncSessionLocal, get_db
from app.models.chat import ChatSession, Message, MessageRole
from app.models.user import User
from app.schemas.chat import (
    ChatRequest,
    SessionDetailResponse,
    SessionListResponse,
    SessionResponse,
    MessageResponse,
)
from app.services.rag_engine import stream_rag_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_session(
    session_id: int | None,
    user_id: int,
    first_message: str,
    db: AsyncSession,
) -> ChatSession:
    if session_id is not None:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        return session

    title = first_message[:60] + ("..." if len(first_message) > 60 else "")
    session = ChatSession(user_id=user_id, title=title)
    db.add(session)
    await db.flush()
    return session


async def _load_history(session_id: int, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [
        {"role": msg.role.value, "content": msg.content}
        for msg in messages
        if msg.role != MessageRole.SYSTEM
    ]


async def _get_daily_request_count(user_id: int, db: AsyncSession) -> int:
    """Count the number of USER messages sent by this user today (UTC)."""
    today_start = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc)
    result = await db.execute(
        select(Message.id)
        .join(ChatSession)
        .where(
            ChatSession.user_id == user_id,
            Message.role == MessageRole.USER,
            Message.created_at >= today_start
        )
    )
    return len(result.scalars().all())


async def _save_assistant_message(
    session_id: int,
    content: str,
    sources: list,
) -> int:
    """
    Save the completed assistant message in a fresh DB session.

    This runs INSIDE the SSE generator — the route's injected db is
    already closed by the time we get here, so we open our own session.
    Returns the saved message id.
    """
    async with AsyncSessionLocal() as db:
        msg = Message(
            session_id=session_id,
            role=MessageRole.ASSISTANT,
            content=content,
            sources=sources,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg.id


# ── SSE streaming endpoint ────────────────────────────────────────────────────

@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stream a chat response token-by-token via SSE.

    The event_generator opens its own sessions for stream-saving logic.
    """
    # ── Plan Enforcement ──────────────────────────────────────────────────────
    is_pro = current_user.plan == "pro"
    
    # 1. Document limit check (Free only)
    if not is_pro and body.document_ids and len(body.document_ids) > 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PLAN_LIMIT_DOCS: Free tier allows maximum 2 documents."
        )

    # 2. Daily request limit check (Free only)
    if not is_pro:
        daily_count = await _get_daily_request_count(current_user.id, db)
        if daily_count >= 15:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="PLAN_LIMIT_REQUESTS: You have reached the daily 15-message limit."
            )

    # ── Pre-stream: all DB work while session is still alive ──────────────
    session = await _get_or_create_session(
        body.session_id, current_user.id, body.message, db
    )

    user_msg = Message(
        session_id=session.id,
        role=MessageRole.USER,
        content=body.message,
    )
    db.add(user_msg)
    await db.commit()

    history = await _load_history(session.id, db)

    # Capture these values — the generator closes over them after db closes
    session_id      = session.id
    user_id         = current_user.id
    message_text    = body.message
    document_ids    = body.document_ids
    web_search      = body.web_search
    user_message_id = user_msg.id

    # Capture filenames for the selected documents for informative source labeling
    doc_id_to_name = {}
    if document_ids:
        from app.models.document import Document
        # We can use the already open 'db' session here
        res = await db.execute(select(Document.id, Document.filename).where(Document.id.in_(document_ids)))
        doc_id_to_name = {row.id: row.filename for row in res}

    # ── Generator: runs AFTER route returns, db is closed ─────────────────
    async def event_generator() -> AsyncGenerator[dict, None]:
        full_text    = ""
        final_sources: list = []

        try:
            # 3. Slow response delay (Free only)
            if not is_pro:
                # Artificial 'thinking' pause to differentiate Free tier speed
                await asyncio.sleep(2)

            async for event in stream_rag_response(
                user_message=message_text,
                user_id=user_id,
                history=history,
                document_ids=document_ids,
                doc_id_to_name=doc_id_to_name,
                web_search_requested=web_search,
            ):
                event_type = event.get("type")

                if event_type == "sources":
                    final_sources = event.get("sources", [])
                    yield {"data": json.dumps(event)}

                elif event_type == "token":
                    full_text += event.get("token", "")
                    yield {"data": json.dumps(event)}

                elif event_type == "done":
                    # Fresh session — route's db is already closed here
                    msg_id = await _save_assistant_message(
                        session_id, full_text, final_sources
                    )
                    yield {
                        "data": json.dumps({
                            "type":       "done",
                            "session_id": session_id,
                            "message_id": msg_id,
                            "user_message_id": user_message_id,
                        })
                    }

                elif event_type == "error":
                    yield {"data": json.dumps(event)}

        except Exception as exc:
            logger.exception(f"SSE generator error: {exc}")
            yield {
                "data": json.dumps({
                    "type":   "error",
                    "detail": "Stream interrupted unexpectedly",
                })
            }

    return EventSourceResponse(event_generator())


# ── Session management ────────────────────────────────────────────────────────

@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    sessions = result.scalars().all()
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions],
        total=len(sessions),
    )


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.refresh(session, ["messages"])
    return SessionDetailResponse(
        session=SessionResponse.model_validate(session),
        messages=[MessageResponse.model_validate(m) for m in session.messages],
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
    await db.delete(session)
    await db.commit()


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a specific message. Verifies ownership via the session's user_id."""
    result = await db.execute(
        select(Message)
        .join(ChatSession)
        .where(
            Message.id == message_id,
            ChatSession.user_id == current_user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.delete(msg)
    await db.commit()