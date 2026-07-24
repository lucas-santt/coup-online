from dataclasses import dataclass, field

from backend.engine.enums import Card


@dataclass
class Player:
	"""One seat in an engine.Match.

	`displayname`/`avatar_url` are a snapshot taken from the seated
	backend.models.player.Player row when the match is built (see
	routers/websockets.py's handle_start_match), not a live reference to
	that row: the DB session which loaded it is request-scoped and closes
	long before this object does, since an engine.Match lives on in the
	in-process registry for the whole match. A mid-match account
	displayname/avatar change just won't retroactively update this seat --
	same as most other online games.
	"""

	id: str
	displayname: str
	avatar_url: str
	coins: int = 0
	cards: list[Card] = field(default_factory=list)

	@property
	def alive(self) -> bool:
		"""A player is alive iff they still have influence (unrevealed
		cards) left. Deliberately not an independently-settable flag --
		that would let it drift out of sync with `cards`, e.g. if a caller
		forgot to flip it after the player's last card is lost."""
		return len(self.cards) > 0
	