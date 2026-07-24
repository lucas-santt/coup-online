from typing import Annotated
import uuid

from fastapi import Depends, Cookie
from sqlmodel import select

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

    try:
        token = uuid.UUID(session_token)
    except ValueError:
        return None

    # Looked up by session_token, not by id: the cookie no longer *is*
    # the player id, it's a per-login token that gets rotated out from
    # under any previous cookie the moment a fresh login/guest/signup
    # happens (see routers/auth.py). A stale cookie simply matches no
    # one here, rather than remaining a valid credential forever.
    player = session.exec(select(Player).where(Player.session_token == token)).first()
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