from typing import Annotated

from fastapi import Depends, HTTPException, status

from backend.auth.optional import (
    OptionalSessionTokenDep,
    OptionalRegisteredOrGuestDep,
    OptionalRegisteredDep,
)
from backend.models.player import Player


def require_session_token(session_token: OptionalSessionTokenDep) -> str:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Acess denied: invalid session.",
        )
    return session_token


RequiredSessionTokenDep = Annotated[str, Depends(require_session_token)]


def require_registered_or_guest(player: OptionalRegisteredOrGuestDep) -> Player:

    if not player:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Acess denied: invalid session or token.",
        )

    return player


RequiredRegisteredOrGuestDep = Annotated[Player, Depends(require_registered_or_guest)]


def require_registered(player: OptionalRegisteredDep) -> Player:

    if not player:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Acess denied: you are not logged in.",
        )

    return player


RequiredRegisteredDep = Annotated[Player, Depends(require_registered)]
