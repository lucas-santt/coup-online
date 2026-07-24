from enum import StrEnum


class Card(StrEnum):
	"""Base-game character types. Reformation adds no new cards yet --
	`Match.reformation` is accepted and stored (see match.py) but nothing
	downstream branches on it, so there's nothing to add here until that
	lands."""

	AMBASSADOR = "Ambassador"
	ASSASSIN = "Assassin"
	CAPTAIN = "Captain"
	CONTESSA = "Contessa"
	DUKE = "Duke"


class Action(StrEnum):
	INCOME = "income"
	FOREIGN_AID = "foreign_aid"
	COUP = "coup"
	TAX = "tax"
	ASSASSINATE = "assassinate"
	STEAL = "steal"
	EXCHANGE = "exchange"


# Actions nobody can block or challenge -- they resolve the instant they're
# declared (see process_event_while_waiting_action).
UNCONTESTABLE_ACTIONS: frozenset[Action] = frozenset({Action.INCOME, Action.COUP})

# Actions that take a target player (coup/assassinate/steal).
TARGETED_ACTIONS: frozenset[Action] = frozenset({Action.COUP, Action.ASSASSINATE, Action.STEAL})

# Actions any living player besides the source may block.
BLOCKABLE_ACTIONS: frozenset[Action] = frozenset({Action.FOREIGN_AID, Action.ASSASSINATE, Action.STEAL})

# Of the blockable actions, these two may only be blocked by their target --
# foreign_aid, the third member of BLOCKABLE_ACTIONS, has no target and can
# be blocked by anyone.
TARGETED_BLOCK_ONLY_ACTIONS: frozenset[Action] = frozenset({Action.ASSASSINATE, Action.STEAL})

# Actions any living player besides the source may challenge.
CHALLENGEABLE_ACTIONS: frozenset[Action] = frozenset(
	{Action.TAX, Action.ASSASSINATE, Action.STEAL, Action.EXCHANGE}
)


class ClientEvent(StrEnum):
	"""Event names a client sends *in* to `Match.process_event`'s `data`
	payload."""

	CHOSEN_ACTION = "chosen_action"
	PASS = "pass"
	BLOCK = "block"
	CHALLENGE = "challenge"
	SELECTED_CARD = "selected_card"
	SELECTED_CARDS = "selected_cards"


class MatchEvent(StrEnum):
	"""Both `Match.status["current_match_state"]` values and the "event"
	names `Match` hands back to callers -- one enum for both, since every
	state this ends up set to is also, at some point, returned verbatim as
	an "event" (see process_event's dispatch table in match.py). The three
	exceptions -- NEW_TURN, ACTION_PASS_REGISTERED, BLOCK_PASS_REGISTERED --
	are only ever returned, never stored as a state."""

	WAITING_ACTION = "waiting_action"
	NEW_TURN = "new_turn"
	ACTION_DECLARED = "action_declared"
	ACTION_CONFIRMED = "action_confirmed"
	ACTION_PASS_REGISTERED = "action_pass_registered"
	BLOCK_DECLARED = "block_declared"
	BLOCK_CONFIRMED = "block_confirmed"
	BLOCK_PASS_REGISTERED = "block_pass_registered"
	ACTION_CHALLENGE_CONFIRMED = "action_challenge_confirmed"
	BLOCK_CHALLENGE_CONFIRMED = "block_challenge_confirmed"
	WAITING_CARD_LOSS = "waiting_card_loss"
	WAITING_EXCHANGE = "waiting_exchange"
	TURN_RESOLVED = "turn_resolved"
	END_OF_MATCH = "end_of_match"