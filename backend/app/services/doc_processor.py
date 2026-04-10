"""
Document processing pipeline: parse → clean → chunk → embed → store

This runs as a FastAPI BackgroundTask after file upload, so the HTTP
response returns immediately and processing happens asynchronously.
The document status in PostgreSQL tracks progress.
"""
import logging
import re
from pathlib import Path

from sentence_transformers import SentenceTransformer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document import Document, DocumentStatus
from app.services.vector_store import upsert_chunks

logger = logging.getLogger(__name__)

# Module-level model — loaded once when the process starts, reused for
# every document. Loading takes ~2s; reloading per request would be unusable.
_embed_model: SentenceTransformer | None = None


def get_embed_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        logger.info(f"Loading embedding model: {settings.EMBED_MODEL}")
        _embed_model = SentenceTransformer(settings.EMBED_MODEL)
    return _embed_model


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_pdf(path: Path) -> str:
    """Extract all text from a PDF using PyMuPDF (fitz)."""
    import fitz  # PyMuPDF — imported here to keep startup fast
    text_parts = []
    with fitz.open(str(path)) as doc:
        for page in doc:
            text_parts.append(page.get_text())
    return "\n".join(text_parts)


def _extract_docx(path: Path) -> str:
    """Extract paragraph text from a .docx file."""
    from docx import Document as DocxDocument
    doc = DocxDocument(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_txt(path: Path) -> str:
    """Read plain text — try UTF-8 first, fall back to latin-1."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


def extract_text(path: Path, content_type: str) -> str:
    """Route to the right extractor based on MIME type."""
    extractors = {
        "application/pdf": _extract_pdf,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _extract_docx,
        "text/plain": _extract_txt,
    }
    extractor = extractors.get(content_type)
    if not extractor:
        raise ValueError(f"Unsupported content type: {content_type}")
    return extractor(path)


# ── Text cleaning ─────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    """
    Normalise whitespace and remove noise before chunking.
    - Collapse 3+ newlines to 2 (preserve paragraph breaks)
    - Collapse multiple spaces/tabs to single space
    - Strip leading/trailing whitespace
    """
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" \n", "\n", text)
    return text.strip()


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """
    Sliding window chunker that respects word boundaries.

    Why word-boundary chunking instead of character-exact?
    Cutting mid-word creates garbage tokens that hurt embedding quality.
    We split on spaces and reconstruct chunks word by word.

    chunk_size: target number of characters per chunk
    overlap: characters shared between adjacent chunks so context
             is not lost at chunk boundaries
    """
    if not text.strip():
        return []

    words = text.split()
    chunks = []
    current_chars = 0
    current_words: list[str] = []
    i = 0

    while i < len(words):
        word = words[i]
        word_len = len(word) + 1  # +1 for the space

        if current_chars + word_len > chunk_size and current_words:
            chunk = " ".join(current_words)
            chunks.append(chunk)

            # Roll back by 'overlap' characters to create the overlap window
            overlap_text = chunk[-overlap:] if len(chunk) > overlap else chunk
            overlap_words = overlap_text.split()
            current_words = overlap_words
            current_chars = sum(len(w) + 1 for w in current_words)
        else:
            current_words.append(word)
            current_chars += word_len
            i += 1

    if current_words:
        chunks.append(" ".join(current_words))

    # Drop chunks that are too short to be meaningful (e.g. page headers)
    return [c for c in chunks if len(c.strip()) > 50]


# ── Embedding ─────────────────────────────────────────────────────────────────

def embed_chunks(chunks: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a list of text chunks.
    batch_size=32 balances memory and speed for CPU inference.
    show_progress_bar=False keeps logs clean in production.
    """
    model = get_embed_model()
    embeddings = model.encode(
        chunks,
        batch_size=32,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return embeddings.tolist()


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def process_document(document_id: int, db: AsyncSession) -> None:
    """
    Full ingestion pipeline — runs in a BackgroundTask.

    Steps:
    1. Load document record from DB
    2. Set status → PROCESSING
    3. Extract text from file
    4. Clean text
    5. Chunk into overlapping windows
    6. Embed all chunks
    7. Store in ChromaDB
    8. Set status → READY with chunk_count
    9. On any error: set status → ERROR with message
    """
    from sqlalchemy import select
    from app.models.document import Document

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()

    if not doc:
        logger.error(f"Document {document_id} not found in DB")
        return

    try:
        # ── Step 1: Mark as processing ────────────────────────────────────
        doc.status = DocumentStatus.PROCESSING
        await db.commit()

        logger.info(f"Processing document {document_id}: {doc.filename}")

        # ── Step 2: Extract text ──────────────────────────────────────────
        file_path = Path(settings.UPLOAD_DIR) / doc.file_path
        if not file_path.exists():
            raise FileNotFoundError(f"File not found on disk: {file_path}")

        raw_text = extract_text(file_path, doc.content_type)
        if not raw_text.strip():
            raise ValueError("Document appears to be empty or unreadable")

        # ── Step 3: Clean + chunk ─────────────────────────────────────────
        clean = clean_text(raw_text)
        chunks = chunk_text(clean, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP)

        if not chunks:
            raise ValueError("No meaningful text chunks could be extracted")

        logger.info(f"Document {document_id}: {len(chunks)} chunks created")

        # ── Step 4: Embed ─────────────────────────────────────────────────
        embeddings = embed_chunks(chunks)

        # ── Step 5: Store in ChromaDB ─────────────────────────────────────
        upsert_chunks(doc.user_id, document_id, chunks, embeddings)

        # ── Step 6: Mark as ready ─────────────────────────────────────────
        doc.status = DocumentStatus.READY
        doc.chunk_count = len(chunks)
        await db.commit()

        logger.info(f"Document {document_id} ready — {len(chunks)} chunks indexed")

    except Exception as exc:
        logger.exception(f"Failed to process document {document_id}: {exc}")
        doc.status = DocumentStatus.ERROR
        doc.error_message = str(exc)
        await db.commit()