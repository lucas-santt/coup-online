import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

from backend import constants
from backend.models.player_match_link import PlayerMatchLink

if TYPE_CHECKING:
	from backend.models.player import Player


# Number of distinct base character types (Ambassador, Assassin, Captain,
# Contessa, Duke -- see engine.match.DEFAULT_BASE_CARDS). Duplicated here as
# a plain int rather than importing engine.match, since it's a fixed
# game-design constant, not a tunable setting, and models/ has no other
# reason to depend on engine/.
BASE_CARD_TYPES: int = 5


class MatchStatus(StrEnum):
	WAITING = "waiting"
	IN_PROGRESS = "in_progress"
	FINISHED = "finished"


class MatchVisibility(StrEnum):
	PUBLIC = "public"
	PRIVATE = "private"


class MatchGameMode(StrEnum):
	CLASSIC = "classic"
	REFORMATION = "reformation"


class MatchBotFill(StrEnum):
	NONE = "none"
	FILL = "fill"
	SOLO = "solo"


class MatchBase(SQLModel):
	lobby_name: str = Field(min_length=1, max_length=30)
	max_players: int = constants.DEFAULT_MAX_PLAYERS
	gamemode: MatchGameMode = MatchGameMode.CLASSIC
	visibility: MatchVisibility = MatchVisibility.PUBLIC
	# Only meaningful when visibility == PRIVATE. Joining by code never
	# checks it (the code itself is the credential); only join_match_by_id
	# (the public browse-list path) does.
	password: str | None = Field(default=None, max_length=50)


class MatchCreate(MatchBase):
	# Arrives in the creation payload but is deliberately NOT a persisted
	# column on Match itself. create_match() writes it straight into the
	# MatchSettings row it seeds alongside Match, per the "schema vs.
	# instance state" split — bot_fill is instance state (editable mid-lobby
	# by the host), not a property of the lobby shell.
	bot_fill: MatchBotFill = MatchBotFill.NONE


class Match(MatchBase, table=True):
	id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
	join_code: str = Field(index=True, unique=True)
	host_id: uuid.UUID | None = Field(default=None, foreign_key="player.id")
	status: MatchStatus = MatchStatus.WAITING
	player_count: int = 0

	# Unused scaffolding for now: no in-match persistence exists yet
	# (game.html / an in-match router haven't been built). While a match
	# is running, the authoritative state lives in the in-process
	# engine.Match instance (see backend/engine/registry.py), not here.
	# Left as a column so it's ready once that design lands rather than
	# needing a later migration.
	current_turn: int | None = None

	# Ping (host -> unready players). Tracked server-side per match so it
	# can't be spoofed or desynced by a client-local counter/timestamp
	# (see brief: two tabs open, or a host refresh, would otherwise disagree
	# with the server's real ping count/cooldown).
	ping_count: int = 0
	ping_cooldown_until: datetime | None = None

	# Rate limit on update_settings — same shape as the ping cooldown above.
	# Not exposed to clients directly; handle_update_settings in
	# routers/websockets.py checks it and raises SETTINGS_ON_COOLDOWN.
	settings_cooldown_until: datetime | None = None

	players: list["Player"] = Relationship(
		back_populates="matches", link_model=PlayerMatchLink
	)
	host: "Player" = Relationship(
		sa_relationship_kwargs={"foreign_keys": "[Match.host_id]"}
	)
	settings: "MatchSettings" = Relationship(
		sa_relationship_kwargs={"uselist": False}
	)


class MatchSettings(SQLModel, table=True):
	"""This match's rule configuration, kept as its own table rather than
	flat columns on Match, per the brief's "schema vs. instance state"
	split: Match is what this lobby *is* (name, code, host, visibility,
	status); this is how this match's rules are configured right now.
	One-to-one with Match, created alongside it at match creation, then
	mutated independently over the socket as the host edits it.
	"""

	match_id: uuid.UUID = Field(foreign_key="match.id", primary_key=True)

	reformation: bool = False
	bot_fill: MatchBotFill = MatchBotFill.NONE
	time_bank: int = constants.MATCH_SETTINGS_SCHEMA["time_bank"]["default"]
	turn_timer: int = constants.MATCH_SETTINGS_SCHEMA["turn_timer"]["default"]
	challenge_timer: int = constants.MATCH_SETTINGS_SCHEMA["challenge_timer"]["default"]
	# -1 stored for "infinite" (frontend's 'inf'), translated at the API
	# boundary (WS/REST) — never stored or sent over the wire as "inf".
	character_copies: int = constants.MATCH_SETTINGS_SCHEMA["character_copies"]["default"]
	declared_coup: bool = False
	declared_assassinate: bool = False
	starting_coins: int = constants.MATCH_SETTINGS_SCHEMA["starting_coins"]["default"]
	coup_cost: int = constants.MATCH_SETTINGS_SCHEMA["coup_cost"]["default"]
	forced_coup_threshold: int = constants.MATCH_SETTINGS_SCHEMA["forced_coup_threshold"]["default"]
	income_coins: int = constants.MATCH_SETTINGS_SCHEMA["income_coins"]["default"]
	foreign_aid_coins: int = constants.MATCH_SETTINGS_SCHEMA["foreign_aid_coins"]["default"]
	assassinate_cost: int = constants.MATCH_SETTINGS_SCHEMA["assassinate_cost"]["default"]
	extort_coins: int = constants.MATCH_SETTINGS_SCHEMA["extort_coins"]["default"]
	tax_coins: int = constants.MATCH_SETTINGS_SCHEMA["tax_coins"]["default"]
	exchange_draw_cards: int = constants.MATCH_SETTINGS_SCHEMA["exchange_draw_cards"]["default"]
	time_bank_count: int = constants.MATCH_SETTINGS_SCHEMA["time_bank_count"]["default"]
	cards_per_player: int = constants.MATCH_SETTINGS_SCHEMA["cards_per_player"]["default"]


def validate_settings_patch(settings: MatchSettings, patch: dict, current_max_players: int) -> dict:
	"""Validates a partial `update_settings` payload against
	constants.MATCH_SETTINGS_SCHEMA (min/max ints), the bool fields, and
	bot_fill's allowed set, plus two cross-field rules: forced_coup_threshold
	>= coup_cost (rejects the patch), and character_copies large enough to
	deal cards_per_player cards to every seat plus an exchange draw (silently
	bumps character_copies instead of rejecting). Never trusts that
	client-side clamping happened — that's a UX nicety only (see settings.js
	/ tribunal-lobby.js), this is the real gate.

	current_max_players is the *resulting* max_players value for this patch
	(the patch's own max_players if that field was touched, otherwise the
	match's current value) — max_players lives on Match, not MatchSettings,
	so unlike every other cross-field input here it can't be read off
	`settings` and has to be passed in by the caller (handle_update_settings
	in routers/websockets.py), which already has to resolve it separately
	anyway (it's validated against the seated-player floor there, not here).

	Returns a dict of {field: validated_value} for exactly the keys that
	were touched (untouched keys are left alone, mirroring the frontend's
	spread-merge `onSettingsChange` behavior) -- plus character_copies if
	the deck-size rule above had to bump it, even if it wasn't in the
	original patch. Raises ValueError naming the offending field(s) on any
	failure; on failure nothing should be applied by the caller.
	"""
	if not patch:
		return {}

	allowed_keys = (
		set(constants.MATCH_SETTINGS_SCHEMA)
		| set(constants.MATCH_SETTINGS_BOOL_FIELDS)
		| {"bot_fill"}
	)
	unknown = set(patch) - allowed_keys
	if unknown:
		raise ValueError(f"Unknown setting(s): {', '.join(sorted(unknown))}")

	validated: dict[str, int | bool | str] = {}

	for key, bounds in constants.MATCH_SETTINGS_SCHEMA.items():
		if key not in patch:
			continue
		raw = patch[key]
		if isinstance(raw, bool):
			raise ValueError(f"{key} must be an integer.")
		try:
			value = int(raw)
		except (TypeError, ValueError):
			raise ValueError(f"{key} must be an integer.")
		if value < bounds["min"] or value > bounds["max"]:
			raise ValueError(
				f"{key} must be between {bounds['min']} and {bounds['max']}."
			)
		validated[key] = value

	for key in constants.MATCH_SETTINGS_BOOL_FIELDS:
		if key not in patch:
			continue
		raw = patch[key]
		if not isinstance(raw, bool):
			raise ValueError(f"{key} must be a boolean.")
		validated[key] = raw

	if "bot_fill" in patch:
		raw = patch["bot_fill"]
		if raw not in constants.MATCH_BOT_FILL_ALLOWED:
			raise ValueError(
				f"bot_fill must be one of {list(constants.MATCH_BOT_FILL_ALLOWED)}."
			)
		validated["bot_fill"] = MatchBotFill(raw)

	# Cross-field rule, checked against the *resulting* values (the patch's
	# value if that field was touched, otherwise the setting's current
	# value) so a patch that only lowers coup_cost still gets checked
	# against the existing forced_coup_threshold, and vice versa.
	resulting_coup_cost = validated.get("coup_cost", settings.coup_cost)
	resulting_forced_coup = validated.get(
		"forced_coup_threshold", settings.forced_coup_threshold
	)
	if resulting_forced_coup < resulting_coup_cost:
		raise ValueError("forced_coup_threshold must be >= coup_cost.")

	# Deck-size rule: the deck (character_copies * BASE_CARD_TYPES cards)
	# must be strictly bigger than what a match start would draw from it —
	# cards_per_player to every seat, plus exchange_draw_cards for the first
	# Ambassador/Inquisitor exchange. Auto-corrected rather than rejected,
	# same "resulting values" pattern as the forced-coup check above. Past
	# the schema's finite max (see constants.MATCH_SETTINGS_SCHEMA's
	# "character_copies" entry), this snaps to -1 (infinite) instead of
	# bumping past it -- mirrors tribunal-lobby.js's minCharacterCopiesFor().
	resulting_copies = validated.get("character_copies", settings.character_copies)
	resulting_cards_per_player = validated.get("cards_per_player", settings.cards_per_player)
	resulting_exchange_draw = validated.get("exchange_draw_cards", settings.exchange_draw_cards)

	# <= 0 is "infinite copies" (see engine/deck.py's Deck, and the -1
	# translation at the API boundary) -- an infinite deck always has
	# enough cards, so there's nothing to bump.
	if resulting_copies > 0:
		required_cards = resulting_cards_per_player * current_max_players + resulting_exchange_draw
		min_copies = required_cards // BASE_CARD_TYPES + 1
		if resulting_copies < min_copies:
			max_finite_copies = constants.MATCH_SETTINGS_SCHEMA["character_copies"]["max"]
			validated["character_copies"] = -1 if min_copies > max_finite_copies else min_copies

	return validated