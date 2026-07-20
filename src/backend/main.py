from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from pydantic import BaseModel

from backend.database import create_db_and_tables
from backend.engine.match import Match
from backend.routers import routers
from backend.constants import STATIC_DIR, PAGES_DIR, ASSETS_DIR

@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)


# Include routers (API endpoints)
for router in routers:
    app.include_router(router)


# Mount 'static' directory
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# src/backend/main.py (or wherever your FastAPI app is instantiated)

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.errors import ErrorCode

FIELD_ERROR_CODES: dict[str, ErrorCode] = {
	"username": ErrorCode.USERNAME_INVALID,
	"password": ErrorCode.PASSWORD_TOO_SHORT,
	"password_confirmation": ErrorCode.PASSWORDS_DONT_MATCH,
}

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
	request: Request, exc: RequestValidationError
) -> JSONResponse:
	first_error = exc.errors()[0]
	field = str(first_error["loc"][-1])
	error_code = FIELD_ERROR_CODES.get(field, ErrorCode.UNKNOWN_ERROR)

	return JSONResponse(
		status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
		content={"detail": {"error_code": error_code, "detail": first_error["msg"]}},
	)

@app.get("/")
async def read_root() -> FileResponse:
    """Serves the root page (index.html)."""
    return FileResponse(PAGES_DIR / "index.html")


@app.get("/lobby")
async def read_lobby() -> FileResponse:
    """Serves the lobby page."""
    return FileResponse(PAGES_DIR / "lobby.html")


@app.get("/game")
async def read_game() -> FileResponse:
    """Serves the game page."""
    return FileResponse(PAGES_DIR / "game.html")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> FileResponse:
    """Serves the favicon."""
    return FileResponse(ASSETS_DIR / "favicon.ico")

active_matches = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    # Accepts the WebSocket connection
    async def connect(self, websocket: WebSocket, match_id: str, player_id: str):
        await websocket.accept()
        if match_id not in self.active_connections:
            self.active_connections[match_id] = {}
        self.active_connections[match_id][player_id] = websocket

    # Removes a player from the match and deletes the match if it has no players
    def disconnect(self, match_id: str, player_id: str):
        if match_id in self.active_connections:
            if player_id in self.active_connections[match_id]:
                del self.active_connections[match_id][player_id]
            if not self.active_connections[match_id]:
                del self.active_connections[match_id]

    # Sends a JSON to a particular player connected to the match
    async def send_personal_message(self, message: dict, match_id: str, player_id: str):
        if match_id in self.active_connections and player_id in self.active_connections[match_id]:
            websocket = self.active_connections[match_id][player_id]
            try:
                await websocket.send_json(message)
            except:
                self.disconnect(match_id, player_id)

    # Sends a JSON to all players connected to the match
    async def broadcast(self, message: dict, match_id: str):
        if match_id in self.active_connections:
            for player_id, websocket in list(self.active_connections[match_id].items()):
                try:
                    await websocket.send_json(message)
                except:
                    self.disconnect(match_id, player_id)


manager = ConnectionManager()

class CreateMatchRequest(BaseModel):
    id: str

class JoinMatchRequest(BaseModel):
    id: str
    name: str

# Creates a new match
@app.post("/api/new_match")
def create_match(req : CreateMatchRequest):
    if req.id in active_matches:
        raise HTTPException(status_code=400, detail=f"This match already exists.")

    active_matches[req.id] = Match(req.id)
    return {"status": "success",
            "message": f"Match {req.id} successfully created."}

# The player does a request and join the match
@app.post("/api/matches/{match_id}/join")
def join_match(match_id: str, req: JoinMatchRequest):
    if match_id not in active_matches:
        raise HTTPException(status_code=404, detail=f"There is no match {match_id}.")
    match = active_matches[match_id]
    try:
        match.add_player(req.id, req.name)
        current_players = [{"id": id, "name": match.players[id].name} for id in match.order]
        return {
            "status": "success",
            "message": f"Player {req.id} joined the match {match_id}.",
            "current_players": current_players}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# It starts the match
@app.post("/api/match/{match_id}/start")
async def start_match(match_id: str):
    if match_id not in active_matches:
        raise HTTPException(status_code=404, detail=f"There is no match {match_id}.")

    match = active_matches[match_id]

    try:
        match.start_match()
        # Signals to every player that the match has started
        await manager.broadcast({
            "event": "match_started",
            "order": match.order,
            "current_turn": match.order[match.turn_id]
        }, match_id)
        # It shows each player their cards and how many coins they have
        for player_id in match.order:
            await manager.send_personal_message({
                "event": "your_state",
                "cards": match.players[player_id].cards,
                "coins": match.players[player_id].coins
            }, match_id, player_id)
        return {"status": "success",
                "message": f"Match {match_id} successfully started.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Maintains a persistent connection with the player during the match
@app.websocket("/ws/{match_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, match_id: str, player_id: str):
    if match_id not in active_matches:
        await websocket.close()
        return
    match = active_matches[match_id]
    if player_id not in match.players:
        await websocket.close()
        return
    player = match.players[player_id]
    await manager.connect(websocket, match_id, player_id)
    await manager.broadcast({"event": "player_connected", "player": player_id}, match_id)
    try:
        while True:
            data = await websocket.receive_json()
            try:
                result = match.process_event(player_id, data)
                if result:
                    # Sends the result of the action to every connected player
                    await manager.broadcast(result, match_id)
                    # if the action has already been completed and has passed the challenge phase, play passes to the next player
                    if result["event"] == "action_completed":
                        new_state = match.new_turn()
                        await manager.broadcast(new_state, match_id)
            # if it is not the player's turn
            except ValueError as e:
                await manager.send_personal_message({"erro": str(e)}, match_id, player_id)
    except WebSocketDisconnect:
        manager.disconnect(match_id, player_id)
        await manager.broadcast({"event": "player_disconnected", "player": player_id}, match_id)


def main() -> None:
    """Starts the server with uvicorn."""
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
