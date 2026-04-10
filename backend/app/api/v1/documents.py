import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.document import Document, DocumentStatus
from app.models.user import User
from app.schemas.document import DocumentListResponse, DocumentResponse
from app.services.doc_processor import process_document
from app.services.vector_store import delete_document_chunks

async def _run_processing(document_id: int) -> None:
    """Top-level helper so tests can patch process_document cleanly."""
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as bg_db:
        await process_document(document_id, bg_db)


router = APIRouter(prefix="/documents", tags=["documents"])

# Allowed MIME types — reject anything else before saving to disk
ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a document for processing.

    Returns 202 Accepted immediately — processing happens in the background.
    Poll GET /documents/{id} to check when status changes to 'ready'.
    """
    # ── Validate file type ────────────────────────────────────────────────
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{suffix}' not supported. Use PDF, DOCX, or TXT.",
        )

    # Read file into memory to check size before writing to disk
    content = await file.read()
    size_bytes = len(content)
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size is {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # ── Save file to disk ─────────────────────────────────────────────────
    # Use UUID filename to avoid collisions and path traversal attacks.
    # We keep the original filename in the DB for display only.
    upload_dir = Path(settings.UPLOAD_DIR) / str(current_user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"{uuid.uuid4()}{suffix}"
    file_path = upload_dir / unique_name
    file_path.write_bytes(content)

    # Relative path stored in DB (relative to UPLOAD_DIR)
    relative_path = str(Path(str(current_user.id)) / unique_name)

    # Determine content type from extension (more reliable than client header)
    content_type_map = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain",
    }
    content_type = content_type_map[suffix]

    # ── Create DB record ──────────────────────────────────────────────────
    doc = Document(
        user_id=current_user.id,
        filename=file.filename or unique_name,
        file_path=relative_path,
        content_type=content_type,
        size_bytes=size_bytes,
        status=DocumentStatus.PENDING,
    )
    db.add(doc)
    await db.commit()  # commit before background task starts so it can find the doc in DB
    await db.refresh(doc)

    # ── Queue background processing ───────────────────────────────────────
    # NEVER pass the request's db session to the background task —
    # it closes when the response is sent. We open a fresh session inside.
    background_tasks.add_task(_run_processing, doc.id)

    return DocumentResponse.model_validate(doc)


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents belonging to the current user."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in docs],
        total=len(docs),
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a single document's status.
    Poll this endpoint after upload to check when processing completes.
    """
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,  # users can only see their own docs
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a document — removes the DB record, disk file, and
    all associated vector chunks from ChromaDB.
    """
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from ChromaDB first (if it was processed successfully)
    if doc.status == DocumentStatus.READY:
        delete_document_chunks(current_user.id, document_id)

    # Remove file from disk
    file_path = Path(settings.UPLOAD_DIR) / doc.file_path
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    # 204 No Content — no response body