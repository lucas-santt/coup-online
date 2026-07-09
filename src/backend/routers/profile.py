from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/me")
async def me():
    pass


@router.get("/display-name")
async def display_name():
    pass


@router.get("/avatar")
async def avatar():
    pass
