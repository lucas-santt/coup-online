import uuid

from sqlmodel import SQLModel, Field


class PlayerMatchLink(SQLModel, table=True):
    player_id: uuid.UUID | None = Field(
        default=None, foreign_key="player.id", primary_key=True
    )
    match_id: uuid.UUID | None = Field(
        default=None, foreign_key="match.id", primary_key=True
    )
