# Coup Online

A browser-based, multiplayer implementation of the card game *Coup* (base game + The Reformation DLC), rendered with WebGL for the in-match view.

## Visual style

Medieval/renaissance: parchment textures, wax seals, ornate borders, serif/blackletter type, deep reds and golds.

## Tech stack

- Frontend: vanilla HTML/CSS/JS, WebGL for the 3D in-match view
- Backend: Python, FastAPI, SQLite via SQLAlchemy (planned)
- Auth: opaque session tokens (not JWT), guest sessions supported
- Docs: GitHub wiki (separate repo), rules and UI flow transcribed there

## Project structure

```
src/
├── backend/          # FastAPI app, routes, game engine/rules
└── static/
    ├── assets/        # images, audio
    ├── pages/         # index.html (auth overlay + lobby), game.html
    ├── styles/
    └── scripts/
        ├── lobby/     # auth overlay, lobby UI, match creation/join
        └── game/      # WebGL engine (model/view/controller)
```

## Running locally

```sh
uv venv
uv pip install -r requirements.txt
uv run uvicorn src.backend.main:app --reload
```

Then open `http://localhost:8000`.

## Flow

- **Out of match**: single page (`index.html`). On first load, an auth overlay (login/signup/guest) sits modally on top; dismissing it reveals the lobby underneath, no page reload. The lobby has Play, Rules, Customization, Settings, and Friends tabs, plus a profile block (avatar with crop/zoom editor, editable display name) and a persistent music control. Play covers creating a match (Reformation toggle, max players, public/private, bot fill options) and joining one (by code or by browsing open rooms), capped at 4 players for now.
- **In match**: WebGL game view, turn-based action selection, challenge/counter screens, turn timeout with decay (30s -> 20s -> 10s -> 5s) and poker-style time bank tokens.

## Current status

The lobby and auth overlay UI is built and working end to end on the frontend, but every network call (auth, profile, matches, friends) is currently mocked with `console.log` + a toast. The intended request/response shapes are documented as comments in `src/static/scripts/lobby/settings.js` under `LOBBY_SETTINGS.endpoints`, so the FastAPI side can be built against that contract. The WebGL game view (`game.html`) hasn't been started.

## Key docs (GitHub wiki)

- `Game-Rules`, `Turn-Summary`, `Game-Rules-Reformation-DLC` — base rules
- `Screens-and-UI-Flow` — every screen/dialog/animation per action (Income, Foreign Aid, Tax, Extort, Exchange, Assassinate, Coup), turn timeout system, challenge resolution

## Roadmap

- Wire the mocked frontend calls to real FastAPI routes (auth, profile, matches, friends)
- SQLite/SQLAlchemy models for users, sessions, matches
- Bot players (fill empty seats / replace disconnects), with difficulty levels (honest, bluff-heavy, balanced)
- WebGL game view and turn/action flow
- Open rules questions live inline in the wiki (e.g. whether Contessa claims can be challenged by non-assassin players)