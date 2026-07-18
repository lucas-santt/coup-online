import uuid
from enum import StrEnum
from typing import Self, TYPE_CHECKING

from pydantic import model_validator
from sqlmodel import Field, Relationship, SQLModel

from backend.models.player_match_link import PlayerMatchLink

if TYPE_CHECKING:
    from backend.models.player import Player


class MatchGameMode(StrEnum):
    CLASSIC = "classic"
    REFORMATION = "reformation"
    REBELLION = "rebellion"
    ANARCHY = "anarchy"


class MatchVisibility(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"


class MatchBotFill(StrEnum):
    NONE = "none"
    FILL = "fill"
    SOLO = "solo"


class MatchStatus(StrEnum):
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class MatchBase(SQLModel):
    lobby_name: str
    max_players: int

    gamemode: MatchGameMode

    visibility: MatchVisibility
    password: str | None = None

    bot_fill: MatchBotFill

    @model_validator(mode="after")
    def check_password(self) -> Self:
        if self.visibility is MatchVisibility.PRIVATE and not self.password:
            raise ValueError("A password is required for private matches.")
        return self


class MatchCreate(MatchBase):
    pass


class Match(MatchBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    host_id: uuid.UUID | None = Field(default=None, foreign_key="player.id")
    host: "Player" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Match.host_id]"}
    )

    join_code: str | None = Field(default=None, unique=True)

    status: MatchStatus = MatchStatus.WAITING

    player_count: int = 0
    current_turn: int = 0

    # TODO: add game state

    players: list["Player"] = Relationship(
        back_populates="matches", link_model=PlayerMatchLink
    )
