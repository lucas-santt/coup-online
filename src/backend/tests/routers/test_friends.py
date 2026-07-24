from backend.models.player import Player


def test_get_friends(session, client):

    player1 = Player(username="player1", password="")
    player2 = Player(username="player2", password="")
    player3 = Player(username="player3", password="")

    session.add_all([player1, player2, player3])
    session.commit()
    session.refresh(player1)
    session.refresh(player2)
    session.refresh(player3)

    player1.friends.append(player2)
    player1.friends.append(player3)

    client.cookies = {"session_token": str(player1.id)}

    response = client.get("/api/friends")
    data = response.json()

    assert response.status_code == 200
    assert len(data) == 2

    assert data[0]["username"] == player2.username
    assert data[0]["displayname"] == player2.displayname
    assert data[0]["status"] == "online"

    assert data[1]["username"] == player3.username
    assert data[1]["displayname"] == player3.displayname
    assert data[1]["status"] == "online"


def test_get_friends_guest(client, test_player):

    response = client.get("/api/friends")

    assert response.status_code == 401
