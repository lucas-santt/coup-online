import pytest


def test_guest(client):

    response = client.post("/api/auth/guest")

    assert response.status_code == 200
    assert "session_token" in client.cookies


def test_guest_already_in(client):

    response = client.post("/api/auth/guest")

    assert response.status_code == 200
    assert "session_token" in client.cookies

    session_token = client.cookies["session_token"]
    response = client.post("/api/auth/guest")

    assert response.status_code == 200
    assert "session_token" in client.cookies
    assert client.cookies["session_token"] == session_token


def test_login(client, test_player):

    response = client.post(
        "/api/auth/login",
        json={"username": test_player.username, "password": test_player.password},
    )

    assert response.status_code == 200
    assert "session_token" in client.cookies
    assert client.cookies["session_token"] == str(test_player.id)


def test_login_wrong_username(client, test_player):

    response = client.post(
        "/api/auth/login",
        json={"username": "wrong_username", "password": test_player.password},
    )

    assert response.status_code == 404


def test_login_wrong_password(client, test_player):

    response = client.post(
        "/api/auth/login",
        json={"username": test_player.username, "password": "wrong_password"},
    )

    assert response.status_code == 404


def test_signup(client):

    response = client.post(
        "/api/auth/signup",
        json={
            "username": "my_username",
            "password": "my_password",
            "password_confirmation": "my_password",
        },
    )

    assert response.status_code == 200
    assert "session_token" in client.cookies
    # assert username == displayname


def test_signup_from_guest(client):
    response = client.post("/api/auth/guest")

    assert response.status_code == 200
    assert "session_token" in client.cookies

    session_token = client.cookies["session_token"]
    response = client.post(
        "/api/auth/signup",
        json={
            "username": "my_username",
            "password": "my_password",
            "password_confirmation": "my_password",
        },
    )

    assert response.status_code == 200
    assert "session_token" in client.cookies
    assert client.cookies["session_token"] == session_token


def test_signup_taken_username(client, test_player):

    response = client.post(
        "/api/auth/signup",
        json={
            "username": test_player.username,
            "password": "my_password",
            "password_confirmation": "my_password",
        },
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    "username",
    ["uu", "uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu", "user name", "user!name"],
    ids=["too_short", "too_long", "with_space", "with_special_char"],
)
def test_signup_invalid_username(client, username):
    response = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "password": "my_password",
            "password_confirmation": "my_password",
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "password",
    ["passwor", "pass word"],
    ids=["too_short", "with_space"],
)
def test_signup_invalid_password(client, password):
    response = client.post(
        "/api/auth/signup",
        json={
            "username": "username",
            "password": password,
            "password_confirmation": password,
        },
    )

    assert response.status_code == 422


def test_signup_wrong_password_confirmation(client):
    response = client.post(
        "/api/auth/signup",
        json={
            "username": "username",
            "password": "my_password",
            "password_confirmation": "mypassword",
        },
    )

    assert response.status_code == 422


def test_signup_from_guest_wrong_password_confirmation(client):
    response = client.post("/api/auth/guest")

    assert response.status_code == 200
    assert "session_token" in client.cookies

    response = client.post(
        "/api/auth/signup",
        json={
            "username": "username",
            "password": "my_password",
            "password_confirmation": "mypassword",
        },
    )

    assert response.status_code == 422


def test_logout(client, test_player):

    response = client.post(
        "/api/auth/login",
        json={"username": test_player.username, "password": test_player.password},
    )

    assert response.status_code == 200
    assert "session_token" in client.cookies
    assert client.cookies["session_token"] == str(test_player.id)

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert test_player.status == "offline"
    assert "session_token" not in client.cookies
