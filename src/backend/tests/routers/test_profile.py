from pathlib import Path

from backend.settings import settings

test_image = Path(__file__).parent / "test_image.png"


def test_me(session, client, test_player):

    client.cookies = {"session_token": str(test_player.id)}

    response = client.get("/api/profile/me")
    data = response.json()

    assert response.status_code == 200

    assert data["username"] == test_player.username
    assert data["displayname"] == test_player.displayname
    assert data["avatar_url"] == test_player.avatar_url
    assert data["is_guest"] == test_player.is_guest


def test_set_display_name(session, client, test_player):

    client.cookies = {"session_token": str(test_player.id)}

    new_display_name = "new display name"
    response = client.patch(
        "/api/profile/display-name", json={"displayname": new_display_name}
    )
    data = response.json()

    assert response.status_code == 200

    assert data["displayname"] == new_display_name
    assert test_player.displayname == new_display_name


def test_set_avatar(session, client, test_player, tmp_path):
    settings.avatar_upload_dir = tmp_path

    client.cookies = {"session_token": str(test_player.id)}

    with open(test_image, "rb") as file:
        response = client.post("/api/profile/avatar", files={"avatar": file})

    data = response.json()

    assert response.status_code == 200

    assert data["avatar_url"] == test_player.avatar_url
