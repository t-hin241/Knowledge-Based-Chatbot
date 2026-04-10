"""empty message

Revision ID: cd18b25120d0
Revises: 
Create Date: 2026-03-31 09:30:41.991422
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
 
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────
    op.create_table('users',
        sa.Column('id',              sa.Integer(),   nullable=False),
        sa.Column('email',           sa.String(255), nullable=False),
        sa.Column('username',        sa.String(100), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('is_active',       sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('is_superuser',    sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    # id is already indexed by the PK constraint — only index lookup columns
    op.create_index('ix_users_email',    'users', ['email'],    unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
 
    # ── documents ──────────────────────────────────────────────────────────
    op.create_table('documents',
        sa.Column('id',            sa.Integer(),   nullable=False),
        sa.Column('user_id',       sa.Integer(),   nullable=False),
        sa.Column('filename',      sa.String(255), nullable=False),
        sa.Column('file_path',     sa.String(512), nullable=False),
        sa.Column('content_type',  sa.String(100), nullable=False),
        sa.Column('size_bytes',    sa.Integer(),   nullable=False),
        sa.Column('status',
            sa.Enum('pending', 'processing', 'ready', 'error', name='documentstatus'),
            nullable=False),
        sa.Column('chunk_count',   sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(),      nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_documents_user_id', 'documents', ['user_id'], unique=False)
    op.create_index('ix_documents_status',  'documents', ['status'],  unique=False)
 
    # ── chat_sessions ──────────────────────────────────────────────────────
    op.create_table('chat_sessions',
        sa.Column('id',      sa.Integer(),   nullable=False),
        sa.Column('user_id', sa.Integer(),   nullable=False),
        sa.Column('title',   sa.String(255), nullable=False, server_default='New chat'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chat_sessions_user_id', 'chat_sessions', ['user_id'], unique=False)
 
    # ── messages ───────────────────────────────────────────────────────────
    op.create_table('messages',
        sa.Column('id',         sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('role',
            sa.Enum('user', 'assistant', 'system', name='messagerole'),
            nullable=False),
        sa.Column('content',    sa.Text(),    nullable=False),
        sa.Column('sources',    sa.JSON(),    nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_messages_session_id', 'messages', ['session_id'], unique=False)
 
 
def downgrade() -> None:
    op.drop_table('messages')
    op.drop_table('chat_sessions')
    op.drop_table('documents')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS messagerole')
    op.execute('DROP TYPE IF EXISTS documentstatus')