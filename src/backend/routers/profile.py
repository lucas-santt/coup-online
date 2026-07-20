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
        "displayname": player.displayname,
        "avatar_url": player.avatar_url,
        "is_guest": player.is_guest,
    }


@router.patch("/display-name")
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
    # TODO: Validate/Process file

    avatar_url = settings.avatar_upload_dir / f"{player.id.hex}.png"

    with open(avatar_url.resolve(), "wb+") as file:
        shutil.copyfileobj(avatar.file, file)

    player.avatar_url = str(avatar_url)
    add_to_db(player, session)

    return {"avatar_url": player.avatar_url}
