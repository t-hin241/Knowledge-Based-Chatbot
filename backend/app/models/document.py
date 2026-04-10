import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DocumentStatus(str, enum.Enum):
    """
    Lifecycle of an uploaded document.
    PENDING  → file saved, background task not yet started
    PROCESSING → task running (parse → chunk → embed)
    READY    → stored in ChromaDB, available for search
    ERROR    → processing failed, error_message has details
    """
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Original filename the user uploaded
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Path on disk (relative to UPLOAD_DIR)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    # MIME type: application/pdf, application/vnd.openxmlformats...
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # File size in bytes — useful for UI display and quota enforcement
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, values_callable=lambda x: [e.value for e in x]), default=DocumentStatus.PENDING, nullable=False, index=True
    )
    # How many text chunks were created and stored in ChromaDB
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    # Populated when status=ERROR
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship — lets us do document.user later
    user = relationship("User", backref="documents")

    def __repr__(self) -> str:
        return f"<Document id={self.id} filename={self.filename!r} status={self.status}>"