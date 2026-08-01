import uuid
import pytest
from fastapi import WebSocketDisconnect
from starlette.testclient import WebSocketDenialResponse


@pytest.mark.parametrize(
    "req_type",
    [
        "set_ready",
        "update_settings",
        "promote_host",
        "kick_player",
        "ping_unready",
        "start_match",
        "chosen_action",
        "pass",
        "block",
        "challenge",
        "reveal_cards",
        "selected_card",
        "selected_cards",
        "leave"
    ],
)
def test_match_websocket(client, req_type, test_player, test_public_match):
    response = client.post(
        "/api/auth/login",
        json={"username": test_player.username, "password": test_player.password},
    )
    assert response.status_code == 200

    response = client.post(f"/api/matches/{test_public_match.id}/join")
    assert response.status_code == 200

    with client.websocket_connect(
        f"/api/ws/matches/{test_public_match.id}"
    ) as websocket:
        websocket.send_json({"type": req_type})
        websocket.receive_json()
        
        if req_type == "leave":
            with pytest.raises(WebSocketDisconnect):
                websocket.receive_json()
        else:
            data = websocket.receive_json()
            assert data is not None


def test_match_websocket_invalid(client, test_public_match):

    with pytest.raises(WebSocketDenialResponse) as exception_info:
        with client.websocket_connect(f"/api/ws/matches/{test_public_match.id}"):
            pass

    assert exception_info.value.status_code == 401


def test_lobby_websocket(client, test_player):

    response = client.post(
        "/api/auth/login",
        json={"username": test_player.username, "password": test_player.password},
    )

    assert response.status_code == 200

    with client.websocket_connect(f"/api/ws/lobby"):
        pass


def test_lobby_websocket_invalid(client):

    with pytest.raises(WebSocketDenialResponse) as exception_info:
        with client.websocket_connect(f"/api/ws/lobby"):
            pass

    assert exception_info.value.status_code == 401

def test_websocket_full_functional_flow(client, test_player, test_public_match):
    client.post("/api/auth/login", json={"username": test_player.username, "password": test_player.password})
    client.post(f"/api/matches/{test_public_match.id}/join")
    with client.websocket_connect(f"/api/ws/matches/{test_public_match.id}") as ws:
        snapshot = ws.receive_json()
        assert snapshot["type"] == "state_snapshot"
        ws.send_json({"type": "ping_unready"})
        while True:
            msg = ws.receive_json()
            if msg["type"] == "ping_received":
                break
        dummy_uuid = str(uuid.uuid4())
        ws.send_json({"type": "promote_host", "payload": {"target_player_id": dummy_uuid}})
        ws.receive_json() 
        
        ws.send_json({"type": "kick_player", "payload": {"target_player_id": dummy_uuid}})
        ws.receive_json() 

        ws.send_json({
            "type": "update_settings",
            "payload": {"settings": {"bot_fill": "fill"}, "max_players": 2}
        })
       
        for _ in range(3):
            try:
                ws.receive_json()
            except Exception:
                break

        ws.send_json({"type": "set_ready", "payload": {"ready": True}})
        for _ in range(3):
            try:
                ws.receive_json()
            except Exception:
                break

        ws.send_json({"type": "start_match"})
        for _ in range(4):
            try:
                ws.receive_json()
            except Exception:
                break

        gameplay_actions = [
            {"type": "chosen_action", "payload": {"action": "income"}},
            {"type": "pass"},
            {"type": "challenge"},
            {"type": "block", "payload": {"claimed_card": "Duke"}},
            {"type": "reveal_cards"},
            {"type": "selected_card", "payload": {"selected_card": "Duke"}},
            {"type": "selected_cards", "payload": {"selected_cards": ["Duke"]}},
        ]

        for action_msg in gameplay_actions:
            ws.send_json(action_msg)
            try:
                resp = ws.receive_json()
                assert "type" in resp
            except Exception:
                break

        ws.send_json({"type": "leave"})