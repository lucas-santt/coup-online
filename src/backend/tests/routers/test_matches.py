import uuid

import pytest

from backend.models.match import Match
from backend.models.player import Player


@pytest.mark.parametrize("bot_fill", ["none", "fill", "solo"])
@pytest.mark.parametrize("gamemode", ["classic", "reformation"])
def test_create_public_match(client, gamemode, bot_fill, test_player):

    client.cookies = {"session_token": str(test_player.id)}

    response = client.post(
        "/api/matches",
        json={
            "lobby_name": "match",
            "max_players": 4,
            "gamemode": gamemode,
            "visibility": "public",
            "bot_fill": bot_fill,
        },
    )
    data = response.json()

    assert response.status_code == 200

    assert "match_id" in data
    assert "join_code" in data


@pytest.mark.parametrize("bot_fill", ["none", "fill", "solo"])
@pytest.mark.parametrize("gamemode", ["classic", "reformation"])
def test_create_private_match(client, gamemode, bot_fill, test_player):

    client.cookies = {"session_token": str(test_player.id)}

    response = client.post(
        "/api/matches",
        json={
            "lobby_name": "match",
            "max_players": 4,
            "gamemode": gamemode,
            "visibility": "private",
            "password": "some_password",
            "bot_fill": bot_fill,
        },
    )
    data = response.json()

    assert response.status_code == 200

    assert "match_id" in data
    assert "join_code" in data


@pytest.mark.parametrize("bot_fill", ["none", "fill", "solo"])
@pytest.mark.parametrize("gamemode", ["classic", "reformation"])
def test_create_match_private_invalid(client, gamemode, bot_fill, test_player):

    client.cookies = {"session_token": str(test_player.id)}

    response = client.post(
        "/api/matches",
        json={
            "lobby_name": "match",
            "max_players": 6,
            "gamemode": "classic",
            "visibility": "private",
            "bot_fill": "none",
        },
    )

    assert response.status_code == 422


def test_get_match(session, client, test_player):

    match1 = Match(
        lobby_name="Super Cool Match",
        max_players=4,
        gamemode="reformation",
        visibility="public",
        bot_fill="none",
        host_id=test_player.id,
    )
    match2 = Match(
        lobby_name="My Cool Match",
        max_players=5,
        gamemode="classic",
        visibility="public",
        bot_fill="fill",
        host_id=test_player.id,
    )
    match3 = Match(
        lobby_name="Seriously Cool Match",
        max_players=4,
        gamemode="classic",
        visibility="private",
        password="some_password",
        bot_fill="solo",
        host_id=test_player.id,
    )
    matches = [match1, match2, match3]

    session.add_all(matches)
    session.commit()
    for match in matches:
        session.refresh(match)

    response = client.get(
        "/api/matches",
        params={"lobby_name": "Cool", "max_players": 4, "visibility": "public"},
    )
    data = response.json()

    assert response.status_code == 200
    assert len(data) == 1

    assert data[0]["match_id"] == str(match1.id)
    assert data[0]["lobby_name"] == match1.lobby_name
    assert data[0]["host_name"] == match1.host.username
    assert data[0]["player_count"] == match1.player_count
    assert data[0]["max_players"] == match1.max_players
    assert data[0]["visibility"] == match1.visibility
    assert data[0]["gamemode"] == match1.gamemode

    response = client.get(
        "/api/matches",
        params={
            "lobby_name": "Cool",
            "max_players": 4,
            "visibility": "public",
            "gamemode": "classic",
        },
    )
    data = response.json()

    assert response.status_code == 200
    assert len(data) == 0


def test_join_match(session, client, test_player):
    client.cookies = {"session_token": str(test_player.id)}

    response = client.post(
        "/api/matches",
        json={
            "lobby_name": "match",
            "max_players": 4,
            "gamemode": "classic",
            "visibility": "public",
            "bot_fill": "none",
        },
    )
    data = response.json()

    assert response.status_code == 200

    match_id = data["match_id"]
    join_code = data["join_code"]

    player1 = Player(username="player1", password="")
    session.add(player1)
    session.commit()
    session.refresh(player1)

    client.cookies = {"session_token": str(player1.id)}

    response = client.post(f"/api/matches/join", json={"join_code": join_code})
    data = response.json()

    assert response.status_code == 200

    assert data["match_id"] == match_id


def test_join_match_invalid(client, test_player):

    client.cookies = {"session_token": str(test_player.id)}

    response = client.post(f"/api/matches/join", json={"join_code": "invalid_code"})

    assert response.status_code == 404


def test_join_public_match_by_id(session, client, test_public_match):

    player1 = Player(username="player1", password="")
    session.add(player1)
    session.commit()
    session.refresh(player1)

    client.cookies = {"session_token": str(player1.id)}

    response = client.post(f"/api/matches/{test_public_match.id}/join")
    data = response.json()

    assert response.status_code == 200
    assert data["match_id"] == str(test_public_match.id)


def test_join_private_match_by_id(session, client, test_private_match):

    player1 = Player(username="player1", password="")
    session.add(player1)
    session.commit()
    session.refresh(player1)

    client.cookies = {"session_token": str(player1.id)}

    response = client.post(
        f"/api/matches/{test_private_match.id}/join", json={"password": "some_password"}
    )
    data = response.json()

    assert response.status_code == 200
    assert data["match_id"] == str(test_private_match.id)


def test_join_private_match_by_id_wrong_password(session, client, test_private_match):

    player1 = Player(username="player1", password="")
    session.add(player1)
    session.commit()
    session.refresh(player1)

    client.cookies = {"session_token": str(player1.id)}

    response = client.post(
        f"/api/matches/{test_private_match.id}/join",
        json={"password": "wrong_password"},
    )

    assert response.status_code == 401


def test_join_match_by_id_invalid(client, test_player):
    client.cookies = {"session_token": str(test_player.id)}

    response = client.post(f"/api/matches/{uuid.uuid4()}/join")

    assert response.status_code == 404
