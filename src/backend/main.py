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

    async def connect(self, websocket: WebSocket, match_id: str, id_player: str):
        await websocket.accept()
        if match_id not in self.active_connections:
            self.active_connections[match_id] = {}
        self.active_connections[match_id][id_player] = websocket

    def disconnect(self, match_id: str, id_player: str):
        if match_id in self.active_connections:
            if id_player in self.active_connections[match_id]:
                del self.active_connections[match_id][id_player]
            if not self.active_connections[match_id]:
                del self.active_connections[match_id]

    async def send_personal_message(self, message: dict, match_id: str, id_player: str):
        if match_id in self.active_connections and id_player in self.active_connections[match_id]:
            websocket = self.active_connections[match_id][id_player]    
            await websocket.send_json(message)

    async def broadcast(self, message: dict, match_id: str):
        if match_id in self.active_connections:
            for websocket in self.active_connections[match_id].values():
                await websocket.send_json(message)

manager = ConnectionManager()

class CreateMatchRequest(BaseModel):
    id: str

class JoinMatchRequest(BaseModel):
    id: str
    name: str

@app.post("/api/new_match")
def create_match(req : CreateMatchRequest):
    if req.id in active_matches:
        raise HTTPException(status_code=400, detail=f"This match already exists.")
    
    active_matches[req.id] = Match(req.id)
    return {"status": "success",
            "message": f"Match {req.id} successfully created."}

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
        for id_player in match.order:
            await manager.send_personal_message({
                "event": "your_cards",
                "cards": match.players[id_player].cards
            }, match_id, id_player)
            await manager.send_personal_message({
                "event": "your_coins",
                "coins": match.players[id_player].coins
            }, match_id, id_player)
        return {"status": "success",
                "message": f"Match {match_id} successfully started.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.websocket("/ws/{match_id}/{id_player}")
async def websocket_endpoint(websocket: WebSocket, match_id: str, id_player: str):
    await manager.connect(websocket, match_id, id_player)
    await manager.broadcast({"event": "player_connected", "player": id_player}, match_id)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast({
                "event": "match_action",
                "player": id_player,
                "details": data
            }, match_id)
            
    except WebSocketDisconnect:
        manager.disconnect(match_id, id_player)
        await manager.broadcast({"event": "player_disconnected", "player": id_player}, match_id)