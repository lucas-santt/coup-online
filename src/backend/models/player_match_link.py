import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import SQLModel, Field


class PlayerConnectionStatus(StrEnum):
	CONNECTED = "connected"
	DISCONNECTED = "disconnected"


class PlayerMatchLink(SQLModel, table=True):
	player_id: uuid.UUID | None = Field(
		default=None, foreign_key="player.id", primary_key=True
	)
	match_id: uuid.UUID | None = Field(
		default=None, foreign_key="match.id", primary_key=True
	)

	# Seating order at join time. Display/seating only — the engine reshuffles
	# actual turn order itself at start_match(), this isn't turn order.
	join_order: int = 0

	ready: bool = False
	ready_forever: bool = False
	is_spectator: bool = False

	# is_host isn't duplicated here on purpose: Match.host_id is already the
	# single source of truth for who's host, two places that could disagree
	# is worse than one lookup.

	connection_status: PlayerConnectionStatus = PlayerConnectionStatus.CONNECTED
	# Set when connection_status flips to DISCONNECTED, cleared on reconnect.
	# grace_period_ends_at is derived from this (+ PLAYER_DISCONNECT_GRACE_SECONDS)
	# rather than stored separately.
	disconnected_at: datetime | None = None
