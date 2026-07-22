import pytest
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect
from src.backend.main import app, active_matches

client = TestClient(app)

@pytest.fixture(autouse=True)
def clear_matches():
    active_matches.clear()

def test_create_match():
    # Tests creating a new match
    response = client.post("/api/new_match", json={"id": "MATCH_0350"})
    assert(response.status_code == 200)
    assert(response.json()["status"] == "success")

    # Tests duplicating a match
    response_dup = client.post("/api/new_match", json={"id": "MATCH_0350"})
    assert response_dup.status_code == 400
    assert "This match already exists." in response_dup.json()["detail"]

def test_join_match():
    # Tests joining a not found match
    response = client.post("/api/matches/MATCH_0351/join", json={"id": "PLAYER_1", "name": "João"})
    assert response.status_code == 404

    # Tests joining a match
    client.post("/api/new_match", json={"id": "MATCH_0350"})
    response = client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_1", "name": "João"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert len(data["current_players"]) == 1
    assert data["current_players"][0]["id"] == "PLAYER_1"

def test_websocket_connection():
    # Tests websocket invalid connection (no corresponding match)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/MATCH_0350/PLAYER_1"):
            pass
    
    # Tests websocket invalid connection (no corresponding player on the match)
    client.post("/api/new_match", json={"id": "MATCH_0350"})
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/MATCH_0350/PLAYER_1"):
            pass

    # Tests websocket valid connection
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_1", "name": "João"})
    with client.websocket_connect("/ws/MATCH_0350/PLAYER_1") as websocket:
        data = websocket.receive_json()
        assert(data["event"] == "player_connected")
        assert(data["player"] == "PLAYER_1")

def test_start_match():
    # Tests a well succeed starting
    client.post("/api/new_match", json={"id": "MATCH_0350"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_1", "name": "João"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_2", "name": "Maria"})
    response = client.post("/api/match/MATCH_0350/start")
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Tests a scenario where the match does not exist
    response_not_found = client.post("/api/match/MATCH_FANTASMA/start")
    assert response_not_found.status_code == 404
    assert "There is no match" in response_not_found.json()["detail"]

    # Tests a scenario where there is only one player
    client.post("/api/new_match", json={"id": "MATCH_0351"})
    client.post("/api/matches/MATCH_0351/join", json={"id": "PLAYER_1", "name": "João"})
    response_bad_request = client.post("/api/match/MATCH_0351/start")
    assert response_bad_request.status_code == 400
    assert "At least 2 players are required" in response_bad_request.json()["detail"]

def test_websocket_messages():
    client.post("/api/new_match", json={"id": "MATCH_0350"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_1", "name": "João"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_2", "name": "Maria"})
    with client.websocket_connect("/ws/MATCH_0350/PLAYER_1") as WebSocket:
        # Tests websocket message of successful connection
        msg_connected = WebSocket.receive_json()
        assert(msg_connected["event"] == "player_connected")
        client.post("/api/match/MATCH_0350/start")
        msg_start = WebSocket.receive_json() 
        assert(msg_start["event"] == "match_started")
        msg_state = WebSocket.receive_json() 
        assert(msg_state["event"] == "your_state")
        # Tests websocket message of unsuccessful action
        WebSocket.send_json({"event": "action", "action": "crazy_action"})
        msg_error = WebSocket.receive_json()
        assert("error" in msg_error)
        assert(msg_error["error"] == "You can not do it right now.")

def test_websocket_disconnect():
    # Tests disconnected player message
    client.post("/api/new_match", json={"id": "MATCH_0350"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_1", "name": "João"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_2", "name": "Maria"})
    with client.websocket_connect("/ws/MATCH_0350/PLAYER_1") as WebSocket1:
        WebSocket1.receive_json()
        with client.websocket_connect("/ws/MATCH_0350/PLAYER_2") as WebSocket2:
            WebSocket1.receive_json() 
            WebSocket2.receive_json()
        disconnect_msg = WebSocket1.receive_json()
        assert disconnect_msg["event"] == "player_disconnected"
        assert disconnect_msg["player"] == "PLAYER_2"

def test_websocket_action_flow():
    # Tests processing a valid action
    client.post("/api/new_match", json={"id": "MATCH_0350"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_1", "name": "João"})
    client.post("/api/matches/MATCH_0350/join", json={"id": "PLAYER_2", "name": "Maria"})
    
    with client.websocket_connect("/ws/MATCH_0350/PLAYER_1") as ws1, \
         client.websocket_connect("/ws/MATCH_0350/PLAYER_2") as ws2:
        ws1.receive_json()
        ws1.receive_json()
        ws2.receive_json()
        client.post("/api/match/MATCH_0350/start")
        start_event = ws1.receive_json()
        ws2.receive_json()
        ws1.receive_json()
        ws2.receive_json()
        current_turn = start_event["current_turn"]
        if current_turn == "PLAYER_1":
            ws1.send_json({"event": "chosen_action", "action": "income"})
            response = ws1.receive_json()
            assert "event" in response
        elif current_turn == "PLAYER_2":
            ws2.send_json({"event": "chosen_action", "action": "income"})
            response = ws2.receive_json()
            assert "event" in response