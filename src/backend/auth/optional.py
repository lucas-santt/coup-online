from typing import Annotated
import uuid

from fastapi import Depends, Cookie

from backend.database import SessionDep
from backend.models.player import Player


def optional_session_token(
    session_token: Annotated[str | None, Cookie()] = None,
) -> str | None:
    return session_token


OptionalSessionTokenDep = Annotated[str | None, Depends(optional_session_token)]


def optional_registered_or_guest(
    session: SessionDep, session_token: OptionalSessionTokenDep
) -> Player | None:

    if not session_token:
        return None

    player_id = uuid.UUID(session_token)
    player = session.get(Player, player_id)
    return player


OptionalRegisteredOrGuestDep = Annotated[
    Player | None, Depends(optional_registered_or_guest)
]


def optional_registered(player: OptionalRegisteredOrGuestDep) -> Player | None:

    if player and not player.is_guest:
        return player
    return None


OptionalRegisteredDep = Annotated[Player | None, Depends(optional_registered)]


def optional_guest(player: OptionalRegisteredOrGuestDep) -> Player | None:

    if player and player.is_guest:
        return player
    return None


OptionalGuestDep = Annotated[Player | None, Depends(optional_guest)]
