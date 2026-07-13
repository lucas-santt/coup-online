from fastapi import APIRouter

from backend.auth.required import RequiredRegisteredDep
from backend.models.player import Player

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("/")
async def get_friends(session_player: RequiredRegisteredDep) -> list[Player]:
    return session_player.friends
