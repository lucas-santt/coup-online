"""In-process registry of live `engine.Match` instances, keyed by match id.

Mirrors the shape of `routers/websockets.py`'s `ConnectionManager`: both are
"lives only as long as this process does" state. No persistence is designed
here — per the brief, `game.html` and any in-match router are out of scope
for this task, so there's nowhere durable to checkpoint engine state to yet.
This is deliberately the minimal thing that lets `handle_start_match` hand
off to the engine without inventing that design silently.

Once an in-match router exists, it's expected to import `get_match` (and
probably `remove_match` on match completion) rather than reaching into
`websockets.py`'s connection manager or vice versa — keep the two registries
independent, they track different lifetimes (a socket can drop and
reconnect mid-match; the engine match instance underneath does not restart).
"""

from backend.engine.match import Match as EngineMatch

_matches: dict[str, EngineMatch] = {}


def set_match(match_id: str, engine_match: EngineMatch) -> None:
	_matches[match_id] = engine_match


def get_match(match_id: str) -> EngineMatch | None:
	return _matches.get(match_id)


def remove_match(match_id: str) -> None:
	_matches.pop(match_id, None)