from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Request bodies ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        # Only letters, numbers, and underscores — no spaces or special chars.
        if not v.replace("_", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, and underscores")
        return v.lower()  # normalise to lowercase for uniqueness checks


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Responses ─────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """
    What we send back to the client about a user.
    NEVER include hashed_password here — Pydantic won't expose
    fields not listed, but being explicit is safer and clearer.
    """
    id: int
    email: str
    username: str
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}  # allows User ORM → UserResponse


class MeResponse(BaseModel):
    user: UserResponse
    message: str = "authenticated"


class UpdateMeRequest(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(None, min_length=3, max_length=30)
    current_password: str | None = None
    new_password: str | None = Field(None, min_length=8, max_length=128)


class DayStats(BaseModel):
    date: str
    total_minutes: int


class UsageStatsResponse(BaseModel):
    usage: list[DayStats]