"""add user plan

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-10 08:31:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('plan', sa.String(length=20), nullable=False, server_default='free'))


def downgrade() -> None:
    op.drop_column('users', 'plan')
