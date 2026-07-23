import random
import secrets
import uuid
from enum import StrEnum
from pathlib import Path
from typing import Self, TYPE_CHECKING

from pydantic import model_validator
from sqlmodel import Field, Relationship, SQLModel

from backend import constants
from backend.models.player_match_link import PlayerMatchLink

if TYPE_CHECKING:
    from backend.models.match import Match


class PlayerType(StrEnum):
    GUEST = "guest"
    REGISTERED = "registered"
    BOT = "bot"


class BotDifficulty(StrEnum):
    HONEST = "honest"
    BLUFF_HEAVY = "bluff_heavy"
    BALANCED = "balanced"


class PlayerStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    IN_GAME = "in_game"


class PlayerFriendLink(SQLModel, table=True):
    player_id: uuid.UUID = Field(foreign_key="player.id", primary_key=True)
    friend_id: uuid.UUID = Field(foreign_key="player.id", primary_key=True)


class PlayerBase(SQLModel):
    username: str = Field(
        min_length=constants.USERNAME_MIN_LENGTH,
        max_length=constants.USERNAME_MAX_LENGTH,
        schema_extra={"pattern": r"^[a-zA-Z0-9_]+$"},
        unique=True,
    )
    password: str = Field(
        min_length=constants.PASSWORD_MIN_LENGTH,
        max_length=constants.PASSWORD_MAX_LENGTH,
        schema_extra={"pattern": r"^[^\s]+$"},
    )

    displayname: str | None = None

    @model_validator(mode="after")
    def set_display_name(self) -> Self:
        if self.displayname is None:
            self.displayname = self.username
        return self


class PlayerLogin(SQLModel):
	username: str
	password: str


class PlayerSignup(PlayerBase):
    password_confirmation: str

    @model_validator(mode="after")
    def check_passwords_match(self) -> Self:
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match.")
        return self


def _to_static_url(path: Path) -> str:
	return f"/static/{path.relative_to(constants.STATIC_DIR).as_posix()}"


def _random_default_avatar_url() -> str:
	files = sorted(constants.DEFAULT_AVATARS_DIR.glob("*.png")) if constants.DEFAULT_AVATARS_DIR.exists() else []
	chosen = random.choice(files) if files else constants.DEFAULT_AVATARS_DIR / "placeholder.png"
	return _to_static_url(chosen)


def make_bot_player(difficulty: BotDifficulty = BotDifficulty.BALANCED) -> "Player":
	"""Builds an unsaved bot Player row. Caller is responsible for adding it
	to the session — kept as a plain factory function, same pattern as guest
	username generation elsewhere. `password` is a random, never-shared
	value: bots can't log in (that exclusion belongs in routers/auth.py, out
	of this task's scope), the field just needs to satisfy PlayerBase's
	schema.
	"""
	return Player(
		username=f"Bot-{secrets.token_hex(4)}",
		password=secrets.token_hex(16),
		displayname=f"Bot-{secrets.token_hex(2)}",
		player_type=PlayerType.BOT,
		bot_difficulty=difficulty,
		is_guest=False,
	)


class Player(PlayerBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    is_guest: bool = False
    player_type: PlayerType = PlayerType.REGISTERED
    # None for humans; only meaningful when player_type == PlayerType.BOT.
    bot_difficulty: BotDifficulty | None = None
    status: PlayerStatus = PlayerStatus.ONLINE
    avatar_url: str = Field(default_factory=_random_default_avatar_url)

    # The value actually carried in the session_token cookie (see
    # routers/auth.py). Rotated on every login/guest/signup, which is what
    # makes "logging in elsewhere kicks the old device" work: an old
    # cookie stops matching the moment a fresh one is issued, rather than
    # remaining valid forever the way `str(player.id)` did.
    session_token: uuid.UUID | None = Field(default=None, index=True)

    wins: int = 0
    losses: int = 0

    friends: list["Player"] = Relationship(
        back_populates="friends",
        link_model=PlayerFriendLink,
        sa_relationship_kwargs=dict(
            primaryjoin="Player.id==PlayerFriendLink.player_id",
            secondaryjoin="Player.id==PlayerFriendLink.friend_id",
        ),
    )

    matches: list["Match"] = Relationship(
        back_populates="players", link_model=PlayerMatchLink
    )