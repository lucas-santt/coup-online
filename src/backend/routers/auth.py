import random
import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import select

from backend.auth.optional import OptionalGuestDep, OptionalRegisteredOrGuestDep
from backend.database import SessionDep, add_to_db
from backend.models.player import (
    Player,
    PlayerStatus,
    PlayerLogin,
    PlayerSignup,
)

from backend.errors import ErrorCode, api_error

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _generate_guest_username(session: SessionDep) -> str:
    while True:
        candidate = f"Guest-{random.randint(0, 999999):06d}"
        taken = session.exec(
            select(Player).where(Player.username == candidate)
        ).first()
        if not taken:
            return candidate


@router.post("/guest")
async def guest(
    session: SessionDep, session_guest: OptionalGuestDep, response: Response
) -> dict[str, str]:

    if not session_guest:
        name = _generate_guest_username(session)
        session_guest = Player(
            username=name, password="", is_guest=True
        )

        add_to_db(session_guest, session)

        response.set_cookie(key="session_token", value=str(session_guest.id))

    return {
        "message": "Successfully entered as guest.",
        "username": session_guest.username,
    }


@router.post("/login")
async def login(
    player_login: PlayerLogin, session: SessionDep, response: Response
) -> dict[str, str]:

    query = (
        select(Player)
        .where(Player.username == player_login.username)
        .where(Player.password == player_login.password)
    )

    db_player: Player | None = session.exec(query).first()

    if not db_player:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.INVALID_CREDENTIALS,
            "Wrong username or password.",
        )

    db_player.status = PlayerStatus.ONLINE
    add_to_db(db_player, session)

    response.set_cookie(key="session_token", value=str(db_player.id))

    return {"message": "Successfully logged in"}


@router.post("/signup")
async def signup(
    player_signup: PlayerSignup,
    session: SessionDep,
    session_guest: OptionalGuestDep,
    response: Response,
) -> dict[str, str]:

    query = select(Player).where(Player.username == player_signup.username)
    db_player = session.exec(query).first()

    if db_player:
        raise api_error(
            status.HTTP_409_CONFLICT,
            ErrorCode.USERNAME_TAKEN,
            "Username already exists.",
        )

    if session_guest:
        session_guest.is_guest = False
        session_guest.username = player_signup.username
        session_guest.password = player_signup.password

        player = session_guest
    else:
        player = Player.model_validate(player_signup)

    add_to_db(player, session)

    response.set_cookie(key="session_token", value=str(player.id))

    return {"message": "Successfully signed up"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session_player: OptionalRegisteredOrGuestDep,  # Maybe change to OptinalRegisteredDep
    session: SessionDep,
) -> None:
    if session_player:
        session_player.status = PlayerStatus.OFFLINE
        add_to_db(session_player, session)

    response.delete_cookie("session_token")