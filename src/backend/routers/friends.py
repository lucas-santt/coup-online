from fastapi import APIRouter

from backend.auth.required import RequiredRegisteredDep

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("/")
async def get_friends(session_player: RequiredRegisteredDep) -> list[dict]:

    friends = [
        {
            "username": friend.username,
            "displayname": friend.displayname,
            "status": friend.status,
        }
        for friend in session_player.friends
    ]

    return friends
