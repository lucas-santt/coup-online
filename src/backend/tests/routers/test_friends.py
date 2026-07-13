from backend.models.player import Player


def test_get_friends(session, client):

    player1 = Player(username="player1", password="")
    player2 = Player(username="player2", password="")
    player3 = Player(username="player3", password="")
    session.add(player1)
    session.add(player2)
    session.add(player3)
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

    assert data[0]["id"] == str(player2.id)
    assert data[0]["username"] == player2.username
    assert data[0]["password"] == player2.password

    assert data[1]["id"] == str(player3.id)
    assert data[1]["username"] == player3.username
    assert data[1]["password"] == player3.password
