from typing import Annotated
import shutil

from fastapi import APIRouter, Body, File, UploadFile

from backend.auth.required import RequiredRegisteredOrGuestDep
from backend.constants import PROFILE_PICTURES_DIR
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
async def set_display_name(
    displayname: Annotated[str, Body(embed=True)],
    session: SessionDep,
    player: RequiredRegisteredOrGuestDep,
) -> dict[str, str | None]:
    # TODO?: Validate display name

    player.displayname = displayname
    add_to_db(player, session)
    return {"displayname": player.displayname}


@router.patch("/avatar")
async def set_avatar(
    avatar: Annotated[UploadFile, File()],
    session: SessionDep,
    player: RequiredRegisteredOrGuestDep,
) -> dict[str, str]:
    # TODO: Validate/Process file

    # TODO: Make this use settings.upload_dir instead of a constant so that
    #  pytest can override it and use tmp_dir instead

    avatar_url = PROFILE_PICTURES_DIR / f"{player.id.hex}.png"

    with open(avatar_url.resolve(), "wb+") as file:
        shutil.copyfileobj(avatar.file, file)

    player.avatar_url = str(avatar_url)
    add_to_db(player, session)

    return {"avatar_url": player.avatar_url}
