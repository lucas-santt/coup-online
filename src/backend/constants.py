from pathlib import Path


SRC_DIR: Path = Path(__file__).resolve().parent.parent
STATIC_DIR: Path = SRC_DIR / "static"
PAGES_DIR: Path = STATIC_DIR / "pages"
ASSETS_DIR: Path = STATIC_DIR / "assets"

DEFAULT_AVATARS_DIR: Path = ASSETS_DIR / "avatars" / "default"

USERNAME_MIN_LENGTH: int = 3
USERNAME_MAX_LENGTH: int = 24

PASSWORD_MIN_LENGTH: int = 3
PASSWORD_MAX_LENGTH: int = 72

# ---------------------------------------------------------------------------
# Lobby / tribunal
# ---------------------------------------------------------------------------

MAX_PLAYERS_MIN: int = 2
MAX_PLAYERS_MAX: int = 10
DEFAULT_MAX_PLAYERS: int = 4

# Single source of truth for every tunable match setting's valid range and
# default. Served as-is (plus max_players/bot_fill, which live outside this
# dict since they aren't plain min/max ints) via GET /api/matches/settings-schema,
# and used server-side by validate_settings_patch() to reject out-of-range
# WS update_settings payloads. The frontend's settings.js used to keep its
# own copy of some of these "in sync manually" — this replaces that.
MATCH_SETTINGS_SCHEMA: dict[str, dict[str, int]] = {
	"time_bank": {"min": 10, "max": 300, "default": 60},
	"turn_timer": {"min": 5, "max": 120, "default": 30},
	"challenge_timer": {"min": 3, "max": 30, "default": 5},
	# -1 means "infinite" (frontend's 'inf'), translated at the API boundary.
	# Capped at 7 finite copies -- validate_settings_patch()'s
	# cards_per_player/max_players/exchange_draw_cards cross-field rule
	# (below) snaps this to -1 (infinite) instead of auto-bumping past 7
	# when a finite deck that size can't be dealt out.
	"character_copies": {"min": -1, "max": 7, "default": 3},
	"starting_coins": {"min": 0, "max": 10, "default": 2},
	"coup_cost": {"min": 1, "max": 20, "default": 7},
	"forced_coup_threshold": {"min": 1, "max": 20, "default": 10},
	"income_coins": {"min": 1, "max": 5, "default": 1},
	"foreign_aid_coins": {"min": 1, "max": 5, "default": 2},
	# Assassin's Assassinate cost, Captain's Extort take, and Duke's Tax
	# take. Previously hardcoded (assassinate_cost lived only as
	# engine.match.DEFAULT_ASSASSINATE_COST; extort/tax weren't
	# configurable anywhere) — now first-class house rules like the ones
	# above.
	"assassinate_cost": {"min": 1, "max": 20, "default": 3},
	"extort_coins": {"min": 0, "max": 10, "default": 2},
	"tax_coins": {"min": 0, "max": 10, "default": 3},
	# Ambassador's Exchange: how many cards are drawn from the deck to
	# choose from before returning two. Deliberately not clamped to "can't
	# exceed the deck" here — copies_by_card/character_copies is a
	# separate, independently-configurable setting, so validating that
	# cross-field interaction belongs with the rest of match-start
	# validation, not here.
	"exchange_draw_cards": {"min": 1, "max": 5, "default": 2},
	# Poker-style time bank tokens: how many times a player can dip into
	# time_bank (above) before their per-turn timer just runs out. Distinct
	# from time_bank itself, which is the duration of each one.
	"time_bank_count": {"min": 0, "max": 10, "default": 2},
	# House rule: how many cards make up a player's hand/influence count.
	# Cross-checked against character_copies/max_players/exchange_draw_cards
	# below, since a small deck can't necessarily support a bigger hand.
	"cards_per_player": {"min": 1, "max": 5, "default": 2},
}

MATCH_SETTINGS_BOOL_FIELDS: tuple[str, ...] = (
	"reformation",
	"declared_coup",
	"declared_assassinate",
)

MATCH_BOT_FILL_ALLOWED: tuple[str, ...] = ("none", "fill", "solo")

MATCH_SETTINGS_CROSS_FIELD_RULES: list[str] = [
	"forced_coup_threshold must be >= coup_cost",
	# Not a rejection rule like the one above -- character_copies is
	# auto-increased (never rejected) if the deck would otherwise be too
	# small to deal cards_per_player cards to every seat plus cover an
	# exchange draw, up to the finite max of 7; beyond that it snaps to -1
	# (infinite) instead of climbing past 7. See validate_settings_patch().
	"character_copies is auto-increased (or set to infinite past 7) so character_copies * 5 > cards_per_player * max_players + exchange_draw_cards",
]

# Ping (host -> unready players)
PING_COOLDOWN_SECONDS: int = 10
PING_LOUDER_EVERY_NTH: int = 5

# Settings changes (host, mid-lobby). Short — this isn't meant to stop a
# host from making several distinct edits in quick succession, only to
# floor a spam loop (e.g. a stuck key repeat, or a compromised/buggy tab
# hammering update_settings) from resetting everyone else's ready state on
# every tick.
SETTINGS_CHANGE_COOLDOWN_SECONDS: float = 0.5

# Disconnect grace period before a dropped player's seat is freed (and, if
# they were host, before succession runs). Same decay-style concept as the
# in-match turn timeout, just a flat window here rather than tiered.
PLAYER_DISCONNECT_GRACE_SECONDS: int = 30

# ---------------------------------------------------------------------------
# Match join codes
# ---------------------------------------------------------------------------

# Crockford's base32 alphabet: digits + uppercase letters, minus I, L, O, U.
# I/L and O/0 are the classic mixups when a code is read aloud, texted, or
# typed from memory; U is dropped too (Crockford drops it to avoid spelling
# anything crude by accident). 32 symbols, so still a clean power of two.
JOIN_CODE_ALPHABET: str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
JOIN_CODE_LENGTH: int = 6
# 32**6 ≈ 1.07 billion possible codes — comfortably large for a
# collision-checked-with-retry, human-shareable code.