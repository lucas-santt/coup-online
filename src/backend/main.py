from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
from engine import Match

app = FastAPI()

# 1. Descobre o caminho absoluto da pasta onde este arquivo (main.py) está (pasta backend)
BASE_DIR = Path(__file__).resolve().parent

# 2. Volta um nível (.parent) e entra na pasta static
STATIC_DIR = BASE_DIR.parent / "static"

# 3. Monta a pasta static para que o navegador consiga carregar os scripts e outros assets
# Agora, um arquivo em static/scripts/app.js poderá ser acessado via /static/scripts/app.js
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# 4. Cria a rota principal para servir o index.html
@app.get("/")
async def read_root():
    # Caminho exato para o index.html
    index_path = STATIC_DIR / "pages" / "index.html"
    
    # Retorna o arquivo HTML diretamente para o navegador
    return FileResponse(index_path)

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
            "current_turn": match.order[match.id_turn]
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