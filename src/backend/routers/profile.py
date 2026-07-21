from typing import Annotated
import shutil

from fastapi import APIRouter, Body, File, UploadFile

from backend.auth.required import RequiredRegisteredOrGuestDep
from backend.settings import settings
from backend.database import SessionDep, add_to_db

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/me")
async def me(player: RequiredRegisteredOrGuestDep) -> dict[str, str | bool | None]:
    return {
        "username": player.username,
        "displayname": player.displayname or player.username,
        "avatar_url": player.avatar_url,
        "is_guest": player.is_guest,
    }


@router.patch("/displayname")
async def set_displayname(
    displayname: Annotated[str, Body(embed=True)],
    session: SessionDep,
    player: RequiredRegisteredOrGuestDep,
) -> dict[str, str | None]:
    # TODO?: Validate display name

    player.displayname = displayname
    add_to_db(player, session)
    return {"displayname": player.displayname}


@router.post("/avatar")
async def set_avatar(
	avatar: Annotated[UploadFile, File()],
	session: SessionDep,
	player: RequiredRegisteredOrGuestDep,
) -> dict[str, str]:
	filename = f"{player.id.hex}.png"
	filepath = settings.avatar_upload_dir / filename

	with open(filepath, "wb+") as file:
		shutil.copyfileobj(avatar.file, file)

	player.avatar_url = f"/static/assets/avatars/uploads/{filename}"
	add_to_db(player, session)

	return {"avatar_url": player.avatar_url}