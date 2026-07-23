import uuid
import secrets
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, status
from sqlmodel import select, col
from sqlalchemy.orm import selectinload

from backend import constants
from backend.auth.optional import OptionalRegisteredOrGuestDep
from backend.auth.required import RequiredRegisteredOrGuestDep
from backend.database import SessionDep, add_to_db
from backend.models.match import (
	Match,
	MatchCreate,
	MatchSettings,
	MatchVisibility,
	MatchGameMode,
	MatchStatus,
)
from backend.models.player_match_link import PlayerMatchLink
from backend.errors import ErrorCode, api_error
from backend.routers.websockets import broadcast_player_joined

router = APIRouter(prefix="/api/matches", tags=["matches"])


def _settings_out(settings: MatchSettings) -> dict:
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
		"assassinate_cost": settings.assassinate_cost,
		"extort_coins": settings.extort_coins,
		"tax_coins": settings.tax_coins,
		"exchange_draw_cards": settings.exchange_draw_cards,
		"time_bank_count": settings.time_bank_count,
		"cards_per_player": settings.cards_per_player,
	}


def _set_join_order(session: SessionDep, player_id: uuid.UUID, match_id: uuid.UUID, order: int) -> None:
	link = session.get(PlayerMatchLink, (player_id, match_id))
	if link is not None:
		link.join_order = order
		session.add(link)
		session.commit()


@router.post("/")
async def create_match(
	match_create: MatchCreate,
	session: SessionDep,
	session_player: RequiredRegisteredOrGuestDep,
) -> dict:

	match = Match(
		lobby_name=match_create.lobby_name,
		max_players=match_create.max_players,
		gamemode=match_create.gamemode,
		visibility=match_create.visibility,
		password=match_create.password,
	)
	match.host_id = session_player.id
	match.players.append(session_player)
	match.player_count = 1

	# Retry on join_code collision (add_to_db raises 409 on the unique
	# constraint) instead of the previous `except status.HTTP_409_CONFLICT`,
	# which could never actually catch anything since that's just an int,
	# not an exception type.
	for _ in range(5):
		try:
			match.join_code = "".join(secrets.choice(constants.JOIN_CODE_ALPHABET) for _ in range(constants.JOIN_CODE_LENGTH))
			add_to_db(match, session)
			break
		except HTTPException as e:
			if e.status_code != status.HTTP_409_CONFLICT:
				raise
	else:
		raise api_error(
			status.HTTP_500_INTERNAL_SERVER_ERROR,
			ErrorCode.UNKNOWN_ERROR,
			"Could not allocate a join code.",
		)

	_set_join_order(session, session_player.id, match.id, 0)

	settings = MatchSettings(match_id=match.id, bot_fill=match_create.bot_fill)
	add_to_db(settings, session)

	return {
		"match_id": str(match.id),
		"join_code": match.join_code,
		"host_id": str(match.host_id),
		"max_players": match.max_players,
		"status": match.status,
		"settings": _settings_out(settings),
	}


@router.get("/settings-schema")
async def get_settings_schema() -> dict:
	return {
		**constants.MATCH_SETTINGS_SCHEMA,
		"max_players": {
			"min": constants.MAX_PLAYERS_MIN,
			"max": constants.MAX_PLAYERS_MAX,
			"default": constants.DEFAULT_MAX_PLAYERS,
		},
		"bot_fill": {
			"allowed": list(constants.MATCH_BOT_FILL_ALLOWED),
			"default": "none",
		},
		"cross_field_rules": constants.MATCH_SETTINGS_CROSS_FIELD_RULES,
	}


@router.get("/me/active")
async def get_active_match(
	session: SessionDep,
	session_player: OptionalRegisteredOrGuestDep,
) -> dict | None:
	if not session_player:
		return None

	query = (
		select(Match)
		.join(PlayerMatchLink, col(PlayerMatchLink.match_id) == col(Match.id))
		.where(PlayerMatchLink.player_id == session_player.id)
		.where(col(Match.status).in_([MatchStatus.WAITING, MatchStatus.IN_PROGRESS]))
	)
	match = session.exec(query).first()
	if not match:
		return None

	return {"match_id": str(match.id), "join_code": match.join_code}


@router.get("/")
async def get_match(
	session: SessionDep,
	lobby_name: str = "",
	max_players: int | None = None,
	visibility: MatchVisibility | None = None,
	gamemode: MatchGameMode | None = None,
) -> list[dict]:
	# All filters optional (contract.md flagged max_players/visibility as
	# required-but-worth-revisiting; made optional here since the browse
	# panel's default view — "show every public match" — can't otherwise
	# be expressed at all). lobby_name="" is a no-op substring filter.

	query = (
		select(Match)
		.where(col(Match.lobby_name).ilike(f"%{lobby_name}%"))
		.where(Match.status == MatchStatus.WAITING)
	)

	if max_players is not None:
		query = query.where(Match.max_players == max_players)

	if visibility is not None:
		query = query.where(Match.visibility == visibility)

	if gamemode:
		query = query.where(Match.gamemode == gamemode)

	matches = [
		{
			"match_id": match.id,
			"lobby_name": match.lobby_name,
			"host_name": match.host.username if match.host else "—",
			"player_count": match.player_count,
			"max_players": match.max_players,
			"visibility": match.visibility,
			"gamemode": match.gamemode,
		}
		for match in session.exec(query).all()
	]

	return matches


@router.post("/join")
async def join_match(
	join_code: Annotated[str, Body(embed=True)],
	session: SessionDep,
	session_player: RequiredRegisteredOrGuestDep,
) -> dict:
	join_code = join_code.strip().upper()

	query = (
		select(Match)
		.where(Match.join_code == join_code)
		.where(Match.status == MatchStatus.WAITING)
	)
	match: Match | None = session.exec(query).first()

	if not match:
		raise api_error(
			status.HTTP_404_NOT_FOUND,
			ErrorCode.MATCH_NOT_FOUND,
			"Match not found.",
		)

	if session_player not in match.players:
		if match.player_count >= match.max_players:
			raise api_error(
				status.HTTP_409_CONFLICT,
				ErrorCode.MATCH_FULL,
				"This match is already full.",
			)

		join_order = match.player_count
		match.player_count += 1
		match.players.append(session_player)

		add_to_db(match, session)
		_set_join_order(session, session_player.id, match.id, join_order)
		await broadcast_player_joined(session, match.id, session_player.id)

	return {"match_id": str(match.id)}


@router.post("/{match_id}/join")
async def join_match_by_id(
	session: SessionDep,
	session_player: RequiredRegisteredOrGuestDep,
	match_id: str,
	password: Annotated[str | None, Body(embed=True)] = None,
) -> dict:

	query = (
		select(Match)
		.where(Match.id == uuid.UUID(match_id))
		.where(Match.status == MatchStatus.WAITING)
	)
	match: Match | None = session.exec(query).first()

	if not match:
		raise api_error(
			status.HTTP_404_NOT_FOUND,
			ErrorCode.MATCH_NOT_FOUND,
			"Match not found.",
		)

	if match.visibility == MatchVisibility.PRIVATE and match.password != password:
		raise api_error(
			status.HTTP_401_UNAUTHORIZED,
			ErrorCode.WRONG_PASSWORD,
			"Wrong password.",
		)

	if session_player not in match.players:
		if match.player_count >= match.max_players:
			raise api_error(
				status.HTTP_409_CONFLICT,
				ErrorCode.MATCH_FULL,
				"This match is already full.",
			)

		join_order = match.player_count
		match.player_count += 1
		match.players.append(session_player)

		add_to_db(match, session)
		_set_join_order(session, session_player.id, match.id, join_order)
		await broadcast_player_joined(session, match.id, session_player.id)

	return {"match_id": str(match.id)}