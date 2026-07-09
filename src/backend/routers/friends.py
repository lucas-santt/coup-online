from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("/")
async def get_friends():
    pass
