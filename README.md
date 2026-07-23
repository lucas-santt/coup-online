# Coup Online

A browser-based, multiplayer implementation of the card game *Coup* (base game + The Reformation DLC), rendered with WebGL for the in-match view.

## Visual style

**Panopticon Deco**: a 1984 / *Papers, Please* / Soviet-bureaucracy aesthetic. Flat color blocking, no gradients or soft shadows, hard unblurred "poster pinned to a wall" offsets instead. Two typefaces only: a stencil/military display face for anything that shouts (headlines, buttons, tab labels) and a plain sans for anything a citizen has to actually read (forms, body copy). The lobby is framed as a "tribunal" (open/join a tribunal, tribunal code, tribunal statutes) rather than a generic game room. Character art, card designs, and the rest of the in-match visuals are being redone to match; this replaces the earlier medieval/parchment direction.

## Tech stack

- Frontend: vanilla HTML/CSS/JS, WebGL for the 3D in-match view
- Backend: Python, FastAPI, SQLite via SQLAlchemy
- Auth: opaque session tokens (not JWT), guest sessions supported
- Docs: GitHub wiki (separate repo), rules and UI flow transcribed there

## Project structure

```
src/
├── backend/
│   ├── auth/          # session dependencies (required/optional, guest-or-registered)
│   ├── connections/    # websocket connection manager
│   ├── engine/         # game engine/rules (match, deck, player, registry)
│   ├── models/         # SQLAlchemy models (match, player, player-match link)
│   ├── routers/         # REST + WS routes: auth, profile, friends, matches, websockets
│   ├── database.py, settings.py, constants.py, errors.py, main.py
└── static/
    ├── assets/        # images, audio (not included in this checkout)
    ├── pages/         # index.html (auth overlay + lobby/tribunal), game.html
    ├── styles/
    └── scripts/
        ├── lobby/     # auth overlay, tribunal-lobby, matches, friends, profile, music, rules
        └── game/      # WebGL engine (model/view/controller)
```

## Running locally

### Install dependencies and run

#### With uv

If you have ``uv`` installed, simply do:
```sh
uv run coup
```

#### Without uv

If you don't have ``uv``, you will need to manage the virtual environment manually.

<details>
<summary>Linux/MacOS</summary>

```sh
# Create venv
python -m venv .venv   

# Activate venv
source .venv/bin/activate

# Install dependencies in venv
python -m pip install -e .
```

</details>

<details>
<summary>Windows</summary>

```sh
# Create venv
python -m venv .venv

# Activate venv
.venv\Scripts\Activate.ps1

# Install dependencies in venv
python -m pip install -e .
```

</details>

Finally, with the venv activated, run with:
```sh
coup
```

Or:
```sh
uvicorn backend.main:app --app-dir src --host 0.0.0.0 --port 8000 --reload --reload-dir src
```

### Open server
Open in `http://localhost:8000`.

## Flow

- **Out of match**: single page (`index.html`). On first load, an auth overlay (login/signup/guest) sits modally on top; dismissing it reveals the lobby underneath, no page reload. The lobby has Play, Rules, Customization, Settings, and Friends tabs, plus a profile block (avatar with crop/zoom editor, editable display name) and a persistent music control. Play covers opening a tribunal (Reformation toggle, max players, public/private, bot fill options, and the rest of the house-rule settings) and joining one (by code or by browsing open tribunals). Once seated, a persistent sidebar shows the roster, ready states, host controls, and match settings, all driven live over a websocket.
- **In match**: WebGL game view, turn-based action selection, challenge/counter screens, turn timeout with decay (30s → 20s → 10s → 5s) and poker-style time bank tokens.

## Current status

- **Lobby/tribunal system: integrated end to end.** Auth, profile, and match creation/joining/browsing are wired to the real FastAPI backend, not mocked. Opening or joining a tribunal hands off to a websocket-driven lobby: roster, ready states, host controls, and live settings changes all arrive as server broadcasts, and match start is gated server-side on every seated player being ready.
- **Starting a match doesn't yet drop players into a match.** The lobby correctly receives `match_started` from the server, but the client-side navigation to the actual match view is the explicit next step, not yet implemented, since `game.html`'s WebGL engine isn't wired to real match state yet.
- **Friends is still a frontend mock.** The backend has a real `GET /api/friends/` endpoint backed by the player model, but the lobby's Friends tab still renders hardcoded sample data instead of calling it, and there's no add/remove/request flow yet on either side.
- **Customization tab is a placeholder.** No backend or real frontend behavior yet; secondary priority.
- The WebGL game view (`game.html`) is a bare canvas + engine bootstrap; it isn't wired to real match/game state yet.

## Roadmap

- Get the "start match" flow all the way through: navigate players from the tribunal sidebar into a real, WebGL-rendered match backed by the engine's game state (turn/action flow, challenges, counters, timers).
- Wire the Friends tab to the real backend endpoint, and add the missing add/remove/request endpoints and UI.
- Build out Customization (themes, avatars, other visual personalization) — secondary priority, after matches and friends are solid.
- Once matches are playable end to end: win/loss counters and experience, with experience unlocking nameplates and skins.
- Stretch goals, if time allows: additional characters and deck customization for more variety/strategy; presets for house-rule configurations so players can save/load favorite settings instead of re-entering them per tribunal.
- Bot players (fill empty seats / replace disconnects), with difficulty levels (honest, bluff-heavy, balanced) — bot fill is already a settings option server-side, the bots themselves aren't implemented yet.

## Key docs (GitHub wiki)

- `Game-Rules`, `Turn-Summary`, `Game-Rules-Reformation-DLC` — base rules
- `Screens-and-UI-Flow` — every screen/dialog/animation per action (Income, Foreign Aid, Tax, Extort, Exchange, Assassinate, Coup), turn timeout system, challenge resolution
- Open rules questions live inline in the wiki (e.g. whether Contessa claims can be challenged by non-assassin players)