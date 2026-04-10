from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.chat import MessageRole


# ── Requests ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: int | None = None       # None = create a new session
    document_ids: list[int] | None = None  # None = search all user docs
    web_search: bool = False            # explicitly request web research


# ── Responses ─────────────────────────────────────────────────────────────────

class SourceItem(BaseModel):
    type: str                   # "document" | "web"
    document_id: int | None = None
    filename: str | None = None
    chunk_index: int | None = None
    url: str | None = None
    title: str | None = None


class MessageResponse(BaseModel):
    id: int
    session_id: int
    role: MessageRole
    content: str
    sources: list[Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionDetailResponse(BaseModel):
    session: SessionResponse
    messages: list[MessageResponse]


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int


# ── SSE event shapes (serialised as JSON inside 'data:' field) ────────────────

class SSETokenEvent(BaseModel):
    type: str = "token"
    token: str


class SSESourcesEvent(BaseModel):
    type: str = "sources"
    sources: list[SourceItem]


class SSEDoneEvent(BaseModel):
    type: str = "done"
    session_id: int
    message_id: int


class SSEErrorEvent(BaseModel):
    type: str = "error"
    detail: str