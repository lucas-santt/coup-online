from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.post("/matches")
async def create_match():
    pass


@router.get("/matches")
async def get_match():
    pass


@router.post("/join")
async def join_match():
    pass


@router.post("/{match_id}/join")
async def join_match_by_id():
    pass
