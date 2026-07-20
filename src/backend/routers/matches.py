import uuid
import secrets
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, status
from sqlmodel import select, col

from backend.auth.required import RequiredRegisteredOrGuestDep
from backend.database import SessionDep, add_to_db
from backend.models.match import (
    Match,
    MatchCreate,
    MatchVisibility,
    MatchGameMode,
    MatchStatus,
)
from backend.errors import ErrorCode, api_error

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.post("/")
async def create_match(
    match_create: MatchCreate,
    session: SessionDep,
    session_player: RequiredRegisteredOrGuestDep,
) -> dict[str, str | None]:

    match = Match.model_validate(match_create)
    match.host_id = session_player.id
    match.players.append(session_player)

    # TODO?: maybe have a max number of retries
    while True:
        try:
            match.join_code = secrets.token_hex(8)
            add_to_db(match, session)
            break
        except status.HTTP_409_CONFLICT:
            pass

    return {"match_id": str(match.id), "join_code": match.join_code}


@router.get("/")
async def get_match(
    session: SessionDep,
    lobby_name: str,
    max_players: int,
    visibility: MatchVisibility,
    gamemode: MatchGameMode | None = None,
) -> list[dict]:

    query = (
        select(Match)
        .where(col(Match.lobby_name).ilike(f"%{lobby_name}%"))
        .where(Match.max_players == max_players)
        .where(Match.visibility == visibility)
        .where(Match.status == MatchStatus.WAITING)
    )

    if gamemode:
        query = query.where(Match.gamemode == gamemode)

    matches = [
        {
            "match_id": match.id,
            "lobby_name": match.lobby_name,
            "host_name": match.host.username,
            "player_count": match.player_count,
            "max_players": match.max_players,
            "visibility": match.visibility,
            "gamemode": match.gamemode,
        }
        for match in session.exec(query).all()
    ]

    return matches


@router.post("/join")
async def join_match(
    join_code: Annotated[str, Body(embed=True)],
    session: SessionDep,
    session_player: RequiredRegisteredOrGuestDep,
):

    query = (
        select(Match)
        .where(Match.join_code == join_code)
        .where(Match.status == MatchStatus.WAITING)
    )
    match: Match | None = session.exec(query).first()

    if not match:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            ErrorCode.MATCH_NOT_FOUND,
            "Match not found.",
        )

    if session_player not in match.players:
        match.player_count += 1
        match.players.append(session_player)

        add_to_db(match, session)

    return {"match_id": match.id}


@router.post("/{match_id}/join")
async def join_match_by_id(
    session: SessionDep,
    session_player: RequiredRegisteredOrGuestDep,
    match_id: str,
    password: Annotated[str | None, Body(embed=True)] = None,
) -> dict:

    query = (
        select(Match)
        .where(Match.id == uuid.UUID(match_id))
        .where(Match.status == MatchStatus.WAITING)
    )
    match: Match | None = session.exec(query).first()

    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Match not found."
        )

    if match.visibility == MatchVisibility.PRIVATE and match.password != password:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            ErrorCode.WRONG_PASSWORD,
            "Wrong password.",
        )

    if session_player not in match.players:
        match.player_count += 1
        match.players.append(session_player)

        add_to_db(match, session)

    return {"match_id": match.id}
