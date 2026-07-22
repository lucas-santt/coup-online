import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from backend import constants
from backend.auth.required import RequiredRegisteredOrGuestDep
from backend.database import engine
from backend.errors import ErrorCode
from backend.engine.match import Match as EngineMatch
from backend.engine import registry as engine_registry
from backend.models.match import Match, MatchBotFill, MatchSettings, MatchStatus, validate_settings_patch
from backend.models.player import Player, make_bot_player
from backend.models.player_match_link import PlayerConnectionStatus, PlayerMatchLink

router = APIRouter(prefix="/api/ws", tags=["websockets"])


# ---------------------------------------------------------------------------
# Connection registry
# ---------------------------------------------------------------------------

class ConnectionManager:
	"""Tracks live sockets per match. A player can have more than one tab
	open, so this is match_id -> player_id -> set[WebSocket], not 1:1 —
	needed so e.g. a `kicked` message reaches every one of that player's
	tabs, not just whichever one happens to be tracked.
	"""

	def __init__(self) -> None:
		self._connections: dict[uuid.UUID, dict[uuid.UUID, set[WebSocket]]] = {}
		self._grace_tasks: dict[tuple[uuid.UUID, uuid.UUID], asyncio.Task] = {}

	def add(self, match_id: uuid.UUID, player_id: uuid.UUID, socket: WebSocket) -> None:
		self._connections.setdefault(match_id, {}).setdefault(player_id, set()).add(socket)

	def remove(self, match_id: uuid.UUID, player_id: uuid.UUID, socket: WebSocket) -> None:
		match_conns = self._connections.get(match_id)
		if not match_conns:
			return
		sockets = match_conns.get(player_id)
		if not sockets:
			return
		sockets.discard(socket)
		if not sockets:
			match_conns.pop(player_id, None)
		if not match_conns:
			self._connections.pop(match_id, None)

	def is_connected(self, match_id: uuid.UUID, player_id: uuid.UUID) -> bool:
		return bool(self._connections.get(match_id, {}).get(player_id))

	async def send_to_player(self, match_id: uuid.UUID, player_id: uuid.UUID, message: dict) -> None:
		for socket in list(self._connections.get(match_id, {}).get(player_id, ())):
			try:
				await socket.send_json(message)
			except Exception:
				pass

	async def broadcast(
		self, match_id: uuid.UUID, message: dict, exclude_player: uuid.UUID | None = None
	) -> None:
		for player_id, sockets in list(self._connections.get(match_id, {}).items()):
			if player_id == exclude_player:
				continue
			for socket in list(sockets):
				try:
					await socket.send_json(message)
				except Exception:
					pass

	def cancel_grace_timer(self, match_id: uuid.UUID, player_id: uuid.UUID) -> None:
		task = self._grace_tasks.pop((match_id, player_id), None)
		if task:
			task.cancel()

	def set_grace_timer(self, match_id: uuid.UUID, player_id: uuid.UUID, task: asyncio.Task) -> None:
		self.cancel_grace_timer(match_id, player_id)
		self._grace_tasks[(match_id, player_id)] = task


manager = ConnectionManager()


class _WsError(Exception):
	def __init__(self, error_code: ErrorCode, detail: str):
		self.error_code = error_code
		self.detail = detail
		super().__init__(detail)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _settings_payload(settings: MatchSettings) -> dict:
	return {
		"reformation": settings.reformation,
		"bot_fill": settings.bot_fill,
		"time_bank": settings.time_bank,
		"turn_timer": settings.turn_timer,
		"challenge_timer": settings.challenge_timer,
		"character_copies": settings.character_copies,
		"declared_coup": settings.declared_coup,
		"declared_assassinate": settings.declared_assassinate,
		"starting_coins": settings.starting_coins,
		"coup_cost": settings.coup_cost,
		"forced_coup_threshold": settings.forced_coup_threshold,
		"income_coins": settings.income_coins,
		"foreign_aid_coins": settings.foreign_aid_coins,
	}


def _links_for_match(session: Session, match_id: uuid.UUID) -> list[PlayerMatchLink]:
	return list(
		session.exec(select(PlayerMatchLink).where(PlayerMatchLink.match_id == match_id)).all()
	)


async def _send_snapshot(websocket: WebSocket, session: Session, match_id: uuid.UUID, local_player_id: uuid.UUID) -> None:
	match = session.get(Match, match_id)
	settings = session.get(MatchSettings, match_id)
	links = sorted(_links_for_match(session, match_id), key=lambda l: l.join_order)

	players_out = []
	for link in links:
		player = session.get(Player, link.player_id)
		if not player:
			continue
		grace_ends = None
		if link.connection_status == PlayerConnectionStatus.DISCONNECTED and link.disconnected_at:
			grace_ends = link.disconnected_at + timedelta(seconds=constants.PLAYER_DISCONNECT_GRACE_SECONDS)
		players_out.append({
			"id": str(player.id),
			"display_name": player.displayname,
			"avatar_url": player.avatar_url,
			"is_host": match.host_id == player.id,
			"ready": link.ready,
			"ready_forever": link.ready_forever,
			"is_spectator": link.is_spectator,
			"join_order": link.join_order,
			"connection_status": link.connection_status,
			"grace_period_ends_at": grace_ends.isoformat() if grace_ends else None,
		})

	await websocket.send_json({
		"type": "state_snapshot",
		"payload": {
			"match_id": str(match.id),
			"join_code": match.join_code,
			"lobby_name": match.lobby_name,
			"max_players": match.max_players,
			"status": match.status,
			"gamemode": match.gamemode,
			"visibility": match.visibility,
			"local_player_id": str(local_player_id),
			"host_id": str(match.host_id) if match.host_id else None,
			"players": players_out,
			"settings": _settings_payload(settings),
			"ping_cooldown_until": match.ping_cooldown_until.isoformat() if match.ping_cooldown_until else None,
			"ping_count": match.ping_count,
		},
	})


# ---------------------------------------------------------------------------
# Shared guards
# ---------------------------------------------------------------------------

def _require_match_waiting(match: Match) -> None:
	if match.status != MatchStatus.WAITING:
		raise _WsError(ErrorCode.MATCH_NOT_WAITING, "The match is no longer waiting for players.")


def _require_host(match: Match, player_id: uuid.UUID) -> None:
	if match.host_id != player_id:
		raise _WsError(ErrorCode.NOT_HOST, "Only the host may do that.")


def _reassign_host_if_needed(session: Session, match: Match) -> uuid.UUID | None:
	"""If match.host_id no longer has a seat, promote the next player by
	join_order. Returns the new host id, or None if the current host is
	still valid (nothing to do) or no players remain (host cleared)."""
	links = _links_for_match(session, match.id)
	if any(link.player_id == match.host_id for link in links):
		return None
	if not links:
		match.host_id = None
		return None
	next_link = min(links, key=lambda l: l.join_order)
	match.host_id = next_link.player_id
	return next_link.player_id


async def _push_start_availability(session: Session, match_id: uuid.UUID) -> None:
	match = session.get(Match, match_id)
	if not match or match.status != MatchStatus.WAITING:
		return
	required = [link for link in _links_for_match(session, match_id) if not link.is_spectator]
	can_start = bool(required) and all(link.ready or link.ready_forever for link in required)
	await manager.broadcast(match_id, {
		"type": "start_availability_changed",
		"payload": {"can_start": can_start},
	})


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

async def handle_set_ready(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	link = session.get(PlayerMatchLink, (player_id, match_id))
	if not match or not link:
		raise _WsError(ErrorCode.PLAYER_NOT_FOUND, "You are not part of this match.")
	_require_match_waiting(match)

	forever = bool(payload.get("forever", False))
	ready = bool(payload.get("ready", False)) or forever

	link.ready = ready
	link.ready_forever = forever
	session.add(link)
	session.commit()

	await websocket.send_json({"type": "ack", "request_id": request_id, "payload": {}})
	await manager.broadcast(match_id, {
		"type": "player_ready_changed",
		"payload": {"player_id": str(player_id), "ready": link.ready, "ready_forever": link.ready_forever},
	})
	await _push_start_availability(session, match_id)


async def handle_update_settings(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	settings = session.get(MatchSettings, match_id)
	if not match or not settings:
		raise _WsError(ErrorCode.MATCH_NOT_FOUND, "Match not found.")
	_require_host(match, player_id)
	_require_match_waiting(match)

	# Rate limit: floors a spam loop (stuck key repeat, or a compromised/
	# buggy tab hammering update_settings) from repeatedly resetting
	# everyone else's ready state on every tick. Short on purpose — this
	# isn't meant to stop a host from making several distinct edits in
	# quick succession, same cooldown shape as ping's, just much shorter.
	now = datetime.now(UTC)
	if match.settings_cooldown_until and now < match.settings_cooldown_until:
		remaining = max(0.1, (match.settings_cooldown_until - now).total_seconds())
		raise _WsError(
			ErrorCode.SETTINGS_ON_COOLDOWN,
			f"Settings changes are on cooldown for {remaining:.1f}s.",
		)

	patch = dict(payload.get("settings") or {})
	max_players_patch = patch.pop("max_players", None)

	try:
		validated = validate_settings_patch(settings, patch)
	except ValueError as e:
		raise _WsError(ErrorCode.SETTINGS_INVALID, str(e))

	if max_players_patch is not None:
		seated = len(_links_for_match(session, match_id))
		try:
			new_max = int(max_players_patch)
		except (TypeError, ValueError):
			raise _WsError(ErrorCode.SETTINGS_INVALID, "max_players must be an integer.")
		floor = max(seated, constants.MAX_PLAYERS_MIN)
		if new_max < floor or new_max > constants.MAX_PLAYERS_MAX:
			raise _WsError(
				ErrorCode.SETTINGS_INVALID,
				f"max_players must be between {floor} and {constants.MAX_PLAYERS_MAX}.",
			)
		match.max_players = new_max
		session.add(match)

	for key, value in validated.items():
		setattr(settings, key, value)
	session.add(settings)

	match.settings_cooldown_until = now + timedelta(seconds=constants.SETTINGS_CHANGE_COOLDOWN_SECONDS)
	session.add(match)

	# Ready resets for everyone except "ready forever", mirrors the existing
	# client-side behavior in onSettingsChange() — now enforced server-side
	# too, not just something the client happens to do to itself.
	for link in _links_for_match(session, match_id):
		if not link.ready_forever:
			link.ready = False
			session.add(link)

	session.commit()
	session.refresh(settings)
	session.refresh(match)

	await websocket.send_json({"type": "ack", "request_id": request_id, "payload": {}})
	await manager.broadcast(match_id, {
		"type": "settings_updated",
		"payload": {"settings": _settings_payload(settings), "max_players": match.max_players},
	})
	await _push_start_availability(session, match_id)


async def handle_promote_host(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	if not match:
		raise _WsError(ErrorCode.MATCH_NOT_FOUND, "Match not found.")
	_require_host(match, player_id)
	_require_match_waiting(match)

	target_id = _parse_target_id(payload)
	if target_id == player_id:
		raise _WsError(ErrorCode.CANNOT_TARGET_SELF, "You are already host.")

	target_link = session.get(PlayerMatchLink, (target_id, match_id))
	if not target_link:
		raise _WsError(ErrorCode.PLAYER_NOT_FOUND, "That player is not in this match.")

	match.host_id = target_id
	session.add(match)
	session.commit()

	await websocket.send_json({"type": "ack", "request_id": request_id, "payload": {}})
	await manager.broadcast(match_id, {
		"type": "host_changed",
		"payload": {"host_id": str(target_id), "reason": "promoted"},
	})


async def handle_kick_player(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	if not match:
		raise _WsError(ErrorCode.MATCH_NOT_FOUND, "Match not found.")
	_require_host(match, player_id)
	_require_match_waiting(match)

	target_id = _parse_target_id(payload)
	if target_id == player_id:
		raise _WsError(ErrorCode.CANNOT_TARGET_SELF, "You can't kick yourself — use leave instead.")

	target_link = session.get(PlayerMatchLink, (target_id, match_id))
	if not target_link:
		raise _WsError(ErrorCode.PLAYER_NOT_FOUND, "That player is not in this match.")

	session.delete(target_link)
	match.player_count = max(0, match.player_count - 1)
	new_host_id = _reassign_host_if_needed(session, match)
	session.add(match)
	session.commit()

	await websocket.send_json({"type": "ack", "request_id": request_id, "payload": {}})
	# Reaches the kicked player's own tab(s) explicitly — can't be inferred
	# from just disappearing off everyone else's roster.
	await manager.send_to_player(match_id, target_id, {
		"type": "kicked",
		"payload": {"detail": "You were removed from this match by the host."},
	})
	await manager.broadcast(match_id, {
		"type": "player_kicked",
		"payload": {"player_id": str(target_id), "new_host_id": str(new_host_id) if new_host_id else None},
	})
	if new_host_id:
		await manager.broadcast(match_id, {
			"type": "host_changed",
			"payload": {"host_id": str(new_host_id), "reason": "kicked"},
		})
	manager.cancel_grace_timer(match_id, target_id)
	await _push_start_availability(session, match_id)


async def handle_ping_unready(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	if not match:
		raise _WsError(ErrorCode.MATCH_NOT_FOUND, "Match not found.")
	_require_host(match, player_id)
	_require_match_waiting(match)

	now = datetime.now(UTC)
	if match.ping_cooldown_until and now < match.ping_cooldown_until:
		remaining = max(1, int((match.ping_cooldown_until - now).total_seconds()))
		raise _WsError(ErrorCode.PING_ON_COOLDOWN, f"Ping is on cooldown for {remaining}s.")

	unready_ids = [
		link.player_id for link in _links_for_match(session, match_id)
		if not link.is_spectator and not link.ready and not link.ready_forever
	]
	if not unready_ids:
		raise _WsError(ErrorCode.NO_UNREADY_PLAYERS, "Everyone is already ready.")

	match.ping_count += 1
	match.ping_cooldown_until = now + timedelta(seconds=constants.PING_COOLDOWN_SECONDS)
	session.add(match)
	session.commit()

	# Server-computed and broadcast, rather than each client counting pings
	# independently — that's what used to desync across tabs/refreshes.
	louder = match.ping_count % constants.PING_LOUDER_EVERY_NTH == 0

	await websocket.send_json({"type": "ack", "request_id": request_id, "payload": {}})
	await manager.broadcast(match_id, {
		"type": "ping_received",
		"payload": {
			"target_player_ids": [str(pid) for pid in unready_ids],
			"ping_count": match.ping_count,
			"louder": louder,
		},
	})


async def handle_start_match(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	settings = session.get(MatchSettings, match_id)
	if not match or not settings:
		raise _WsError(ErrorCode.MATCH_NOT_FOUND, "Match not found.")
	_require_host(match, player_id)
	_require_match_waiting(match)

	required = [link for link in _links_for_match(session, match_id) if not link.is_spectator]
	if not required or not all(link.ready or link.ready_forever for link in required):
		raise _WsError(ErrorCode.NOT_ALL_READY, "Not everyone is ready yet.")

	# Bot fill happens here, once, at the moment of starting — never before,
	# per the brief (no meaningful difference between "solo" and "fill" from
	# the backend's point of view, both are "top up empty seats at start").
	# Bots get real persisted Player rows + PlayerMatchLink rows so they show
	# up in the same roster the engine hand-off below reads from, rather
	# than being a separate parallel list the engine has to special-case.
	bot_links: list[PlayerMatchLink] = []
	if settings.bot_fill != MatchBotFill.NONE:
		open_seats = match.max_players - len(required)
		next_join_order = max((link.join_order for link in required), default=-1) + 1
		for _ in range(max(0, open_seats)):
			bot = make_bot_player()
			session.add(bot)
			session.flush()  # need bot.id before the link row can reference it
			bot_link = PlayerMatchLink(
				player_id=bot.id,
				match_id=match.id,
				join_order=next_join_order,
				ready=True,
				is_spectator=False,
			)
			session.add(bot_link)
			bot_links.append(bot_link)
			next_join_order += 1
		match.player_count += len(bot_links)

	match.status = MatchStatus.IN_PROGRESS
	session.add(match)
	session.commit()

	await websocket.send_json({"type": "ack", "request_id": request_id, "payload": {}})
	await manager.broadcast(match_id, {"type": "match_starting", "payload": {"starts_in_ms": 0}})
	await manager.broadcast(match_id, {"type": "match_started", "payload": {"match_id": str(match_id)}})

	# Hand-off to backend/engine/match.py. The resulting instance lives in
	# the in-process registry (backend/engine/registry.py) — there's nowhere
	# durable to persist engine state yet (game.html/the in-match router
	# don't exist), same "lives only as long as this process does" shape as
	# the ConnectionManager above.
	engine_match = EngineMatch(
		id=str(match.id),
		coup_cost=settings.coup_cost,
		forced_coup_threshold=settings.forced_coup_threshold,
		income_coins=settings.income_coins,
		foreign_aid_coins=settings.foreign_aid_coins,
		reformation=settings.reformation,
		declared_coup=settings.declared_coup,
		declared_assassinate=settings.declared_assassinate,
	)
	for link in sorted(required, key=lambda l: l.join_order):
		seated_player = session.get(Player, link.player_id)
		if seated_player:
			engine_match.add_player(str(seated_player.id), seated_player.displayname)
	for bot_link in bot_links:
		bot_player = session.get(Player, bot_link.player_id)
		if bot_player:
			engine_match.add_player(str(bot_player.id), bot_player.displayname)
	engine_match.start_match(
		copies_by_card=None if settings.character_copies == -1 else settings.character_copies,
		starting_coins=settings.starting_coins,
	)
	engine_registry.set_match(str(match.id), engine_match)


async def handle_leave(session: Session, websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, request_id: str | None, payload: dict) -> None:
	match = session.get(Match, match_id)
	link = session.get(PlayerMatchLink, (player_id, match_id))
	if not match or not link:
		return

	session.delete(link)
	match.player_count = max(0, match.player_count - 1)
	new_host_id = _reassign_host_if_needed(session, match)
	session.add(match)
	session.commit()

	manager.cancel_grace_timer(match_id, player_id)
	await manager.broadcast(match_id, {
		"type": "player_left",
		"payload": {"player_id": str(player_id), "new_host_id": str(new_host_id) if new_host_id else None},
	}, exclude_player=player_id)
	if new_host_id:
		await manager.broadcast(match_id, {
			"type": "host_changed",
			"payload": {"host_id": str(new_host_id), "reason": "left"},
		}, exclude_player=player_id)
	await _push_start_availability(session, match_id)
	await websocket.close(code=1000)


def _parse_target_id(payload: dict) -> uuid.UUID:
	raw = payload.get("target_player_id")
	try:
		return uuid.UUID(str(raw))
	except (TypeError, ValueError):
		raise _WsError(ErrorCode.PLAYER_NOT_FOUND, "Invalid target player id.")


_HANDLERS = {
	"set_ready": handle_set_ready,
	"update_settings": handle_update_settings,
	"promote_host": handle_promote_host,
	"kick_player": handle_kick_player,
	"ping_unready": handle_ping_unready,
	"start_match": handle_start_match,
	"leave": handle_leave,
}


async def _dispatch(websocket: WebSocket, match_id: uuid.UUID, player_id: uuid.UUID, message: dict) -> None:
	msg_type = message.get("type")
	request_id = message.get("request_id")
	payload = message.get("payload") or {}

	handler = _HANDLERS.get(msg_type)
	if not handler:
		await websocket.send_json({
			"type": "error",
			"request_id": request_id,
			"payload": {"error_code": ErrorCode.UNKNOWN_ERROR, "detail": f"Unknown message type '{msg_type}'."},
		})
		return

	# Each message gets its own short-lived session — the connection itself
	# is long-lived, but there's no FastAPI request/response cycle here to
	# hang a request-scoped SessionDep off of.
	with Session(engine) as session:
		try:
			await handler(session, websocket, match_id, player_id, request_id, payload)
		except _WsError as e:
			await websocket.send_json({
				"type": "error",
				"request_id": request_id,
				"payload": {"error_code": e.error_code, "detail": e.detail},
			})


# ---------------------------------------------------------------------------
# Disconnect / reconnect handling
# ---------------------------------------------------------------------------

async def _mark_connected(session: Session, match_id: uuid.UUID, player_id: uuid.UUID) -> None:
	link = session.get(PlayerMatchLink, (player_id, match_id))
	if not link:
		return
	link.connection_status = PlayerConnectionStatus.CONNECTED
	link.disconnected_at = None
	session.add(link)
	session.commit()


async def _start_disconnect_grace(match_id: uuid.UUID, player_id: uuid.UUID) -> None:
	with Session(engine) as session:
		link = session.get(PlayerMatchLink, (player_id, match_id))
		match = session.get(Match, match_id)
		if not link or not match:
			return
		link.connection_status = PlayerConnectionStatus.DISCONNECTED
		link.disconnected_at = datetime.now(UTC)
		session.add(link)
		session.commit()
		grace_ends = link.disconnected_at + timedelta(seconds=constants.PLAYER_DISCONNECT_GRACE_SECONDS)

	await manager.broadcast(match_id, {
		"type": "player_connection_changed",
		"payload": {
			"player_id": str(player_id),
			"connected": False,
			"grace_period_ends_at": grace_ends.isoformat(),
		},
	})

	task = asyncio.create_task(_disconnect_grace_timeout(match_id, player_id))
	manager.set_grace_timer(match_id, player_id, task)


async def _disconnect_grace_timeout(match_id: uuid.UUID, player_id: uuid.UUID) -> None:
	try:
		await asyncio.sleep(constants.PLAYER_DISCONNECT_GRACE_SECONDS)
	except asyncio.CancelledError:
		return  # reconnected in time, cancel_grace_timer() got here first

	with Session(engine) as session:
		link = session.get(PlayerMatchLink, (player_id, match_id))
		match = session.get(Match, match_id)
		if not link or not match or link.connection_status != PlayerConnectionStatus.DISCONNECTED:
			return

		session.delete(link)
		match.player_count = max(0, match.player_count - 1)
		new_host_id = _reassign_host_if_needed(session, match)
		session.add(match)
		session.commit()

	await manager.broadcast(match_id, {
		"type": "player_left",
		"payload": {"player_id": str(player_id), "new_host_id": str(new_host_id) if new_host_id else None},
	})
	if new_host_id:
		await manager.broadcast(match_id, {
			"type": "host_changed",
			"payload": {"host_id": str(new_host_id), "reason": "disconnect_timeout"},
		})

	with Session(engine) as session:
		await _push_start_availability(session, match_id)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.websocket("/matches/{match_id}")
async def match_socket(
	websocket: WebSocket,
	match_id: str,
	player: RequiredRegisteredOrGuestDep,
) -> None:
	try:
		match_uuid = uuid.UUID(match_id)
	except ValueError:
		await websocket.close(code=1008)
		return

	with Session(engine) as session:
		match = session.get(Match, match_uuid)
		link = session.get(PlayerMatchLink, (player.id, match_uuid)) if match else None
		if not match or not link:
			await websocket.close(code=1008)
			return

	await websocket.accept()
	manager.cancel_grace_timer(match_uuid, player.id)
	manager.add(match_uuid, player.id, websocket)

	with Session(engine) as session:
		await _mark_connected(session, match_uuid, player.id)
		await _send_snapshot(websocket, session, match_uuid, player.id)

	await manager.broadcast(match_uuid, {
		"type": "player_connection_changed",
		"payload": {"player_id": str(player.id), "connected": True, "grace_period_ends_at": None},
	}, exclude_player=player.id)

	try:
		while True:
			message = await websocket.receive_json()
			await _dispatch(websocket, match_uuid, player.id, message)
	except WebSocketDisconnect:
		pass
	finally:
		manager.remove(match_uuid, player.id, websocket)
		if not manager.is_connected(match_uuid, player.id):
			await _start_disconnect_grace(match_uuid, player.id)