import uuid
from enum import StrEnum
from typing import Self

from pydantic import model_validator
from sqlmodel import Field, Relationship, SQLModel

from backend import constants


class PlayerType(StrEnum):
    GUEST = "guest"
    REGISTERED = "registered"


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


class PlayerLogin(PlayerBase):
    pass


class PlayerSignup(PlayerBase):
    password_confirmation: str

    @model_validator(mode="after")
    def check_passwords_match(self) -> Self:
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match.")
        return self


class Player(PlayerBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    is_guest: bool = False  ## type: PlayerType = PlayerType.REGISTERED ?
    status: PlayerStatus = PlayerStatus.ONLINE
    avatar_url: str = str(constants.DEFAULT_AVATAR_PATH)

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
