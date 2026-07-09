from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/guest")
async def guest():
    pass


@router.post("/login")
async def login():
    pass


@router.get("/signup")
async def signup():
    pass


@router.post("/logout")
async def logout():
    pass
