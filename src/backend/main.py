from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

app = FastAPI()

# 1. Descobre o caminho absoluto da pasta onde este arquivo (main.py) está (pasta backend)
BASE_DIR = Path(__file__).resolve().parent

# 2. Volta um nível (.parent) e entra na pasta static
STATIC_DIR = BASE_DIR.parent / "static"

# 3. Monta a pasta static para que o navegador consiga carregar os scripts e outros assets
# Agora, um arquivo em static/scripts/app.js poderá ser acessado via /static/scripts/app.js
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# 4. Cria a rota principal para servir o index.html (landing)
@app.get("/")
async def read_root():
    # Caminho exato para o index.html
    index_path = STATIC_DIR / "pages" / "index.html"

    # Retorna o arquivo HTML diretamente para o navegador
    return FileResponse(index_path)

# 4b. Rota para a lobby (após login/guest na landing)
@app.get("/lobby")
async def read_lobby():
    lobby_path = STATIC_DIR / "pages" / "lobby.html"
    return FileResponse(lobby_path)

@app.get("/game")
async def read_game():
    game_path = STATIC_DIR / "pages" / "game.html"
    return FileResponse(game_path)

# 5. Serve o favicon na raiz para compatibilidade com os browsers
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(STATIC_DIR / "assets" / "favicon.ico")