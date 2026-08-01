import random
from typing import Any
from typing import TypedDict
from backend import constants
from backend.engine.deck import Deck
from backend.engine.enums import Action, Card, Religion, MatchEvent
from backend.engine.player import Player

class MatchStatusInfo(TypedDict):
	started: bool
	finished: bool
	current_match_state: MatchEvent | None

class TurnDescription(TypedDict):
	source_id: str | None
	target_id: str | None
	action: Action | None
	blocker_id: str | None
	challenger_id: str | None
	declared_card: Card | None
	exchange_player_id: str | None
	exchange_return_count: int | None
	players_passed_action: list[str]
	players_passed_block: list[str]
	# Which character a block claims. Only ever set for Steal, where the
	# blocker has a real choice (Captain or Ambassador) -- Foreign Aid and
	# Assassinate each have exactly one legal claim (see enums.BLOCK_CLAIMS)
	# but it's still recorded here uniformly so resolve_block_challenge()
	# has one place to read it from regardless of which action it was.
	block_claimed_card: Card | None
	# Set by resolve_action_challenge()/resolve_block_challenge() right
	# before handing off to WAITING_CARD_LOSS: who is choosing a card to
	# lose. Distinct from target_id, since a challenge can send the
	# *source*, the *blocker*, or the *challenger* to lose a card --
	# none of which is necessarily the action's target.
	card_loss_player_id: str | None
	# What to do once that card-loss selection comes back, for the two
	# challenge-driven cases only (left None for an ordinary coup/
	# assassinate hit, which just resolves the turn as before):
	# "action_proceeds" -- the challenged claim was vindicated (or a fake
	# block was caught), so the original action still needs to execute;
	# "action_cancelled" -- the challenged claim was a bluff (or a genuine
	# block stood), so the action never happens.
	pending_resolution: str | None
	
class MatchState:
	"""One in-progress (or about-to-start) game of Coup.

	A Match's roster is fixed at construction time -- `players` is the
	lobby's already-resolved, already-seated list (humans plus any bots
	assigned at start, see routers/websockets.py's handle_start_match).
	There is deliberately no add_player/remove_player: real Coup doesn't
	let people join or leave mid-game, and by the time a Match exists the
	lobby has already closed. If mid-match disconnect handling (e.g.
	replacing a dropped player with a bot) is needed later, that's a
	distinct, narrower operation than "arbitrary roster changes" and
	should be its own method rather than reviving add_player/remove_player.
	"""

	def __init__(
		self,
		id: str,
		players: list[Player],
		base_cards: list[Card] | None = None,
		*,
		cards_per_player: int = constants.MATCH_SETTINGS_SCHEMA["cards_per_player"]["default"],
		character_copies: int = constants.MATCH_SETTINGS_SCHEMA["character_copies"]["default"],
		starting_coins: int = constants.MATCH_SETTINGS_SCHEMA["starting_coins"]["default"],
		coup_cost: int = constants.MATCH_SETTINGS_SCHEMA["coup_cost"]["default"],
		forced_coup_threshold: int = constants.MATCH_SETTINGS_SCHEMA["forced_coup_threshold"]["default"],
		assassinate_cost: int = constants.MATCH_SETTINGS_SCHEMA["assassinate_cost"]["default"],
		income_coins: int = constants.MATCH_SETTINGS_SCHEMA["income_coins"]["default"],
		foreign_aid_coins: int = constants.MATCH_SETTINGS_SCHEMA["foreign_aid_coins"]["default"],
		extort_coins: int = constants.MATCH_SETTINGS_SCHEMA["extort_coins"]["default"],
		tax_coins: int = constants.MATCH_SETTINGS_SCHEMA["tax_coins"]["default"],
        self_conversion_coins: int = constants.MATCH_SETTINGS_SCHEMA["self_conversion_coins"]["default"],
        force_conversion_coins: int = constants.MATCH_SETTINGS_SCHEMA["force_conversion_coins"]["default"],
		exchange_draw_cards: int = constants.MATCH_SETTINGS_SCHEMA["exchange_draw_cards"]["default"],
		inquisitor_exchange_draw_cards: int = constants.MATCH_SETTINGS_SCHEMA["inquisitor_exchange_draw_cards"]["default"],
		reformation: bool = False,
		declared_coup: bool = False,
		declared_assassinate: bool = False,
        base_religions: list[Religion] | None = None,
	) -> None:
		if len(players) < 2:
			raise ValueError("At least 2 players are required to start a match.")
		if len(players) > 10:
			raise ValueError("A match can have at most 10 players.")

		self.id = id
		self.base_cards: list[Card] = base_cards if base_cards is not None else list(Card)
		self.reformation = reformation
		if self.reformation and Card.AMBASSADOR in self.base_cards:
			self.base_cards.remove(Card.AMBASSADOR)
		elif Card.INQUISITOR in self.base_cards:
			self.base_cards.remove(Card.INQUISITOR)

		self.base_religions: list[Religion] = base_religions if base_religions is not None else list(Religion)
		# <= 0 character_copies means an infinite deck (see engine.deck.Deck)
		# -- always enough cards, nothing to check. Otherwise the deck must
		# be strictly bigger than what a start draws from it: cards_per_player
		# to every seat, plus one exchange draw. Mirrors
		# models.match.validate_settings_patch()'s cross-field rule, checked
		# again here since the engine shouldn't have to trust every caller
		# reproduced that check correctly.
		required_cards = cards_per_player * len(players) + exchange_draw_cards
		if character_copies > 0 and character_copies * len(self.base_cards) <= required_cards:
			raise ValueError(
				"character_copies is too small to deal cards_per_player cards "
				"to every seat plus an exchange draw."
			)

		self.players: dict[str, Player] = {player.id: player for player in players}
		self.order: list[str] = [player.id for player in players]  # player order
		self.turn_id: int = 0  # index into self.order of whose turn it is
		self._eliminated: set[str] = set()  # ids already reported by check_elimination()

		self.status: MatchStatusInfo = {
		"started": False,
		"finished": False,
		"current_match_state": None,
		}
		# Possible values of current_match_state (see enums.MatchEvent):
		# WAITING_ACTION: waiting for the player on the turn to choose an action;
		# ACTION_DECLARED: the player on the turn declared their action, but it is subject to challenges or blocks;
		# BLOCK_DECLARED: a player blocked the current action, but it is open to challenge;
		# ACTION_CONFIRMED: all other players accepted the action, which will be executed immediately;
		# BLOCK_CONFIRMED: all other players accepted the block. The current action will be canceled;
		# ACTION_CHALLENGE_CONFIRMED: an action challenge has been initiated and will be resolved immediately;
		# BLOCK_CHALLENGE_CONFIRMED: a block challenge has been initiated and will be resolved immediately;
		# WAITING_CARD_LOSS: a player with more than one card has lost influence and must choose one of their cards;
		# WAITING_EXCHANGE: a player used Exchange or revealed to a declared hit and must return drawn cards;
		# TURN_RESOLVED: declares the current turn resolved. The next step is to start a new turn.

		self.turn_description: TurnDescription = self._blank_turn_description()

		# Ruleset values, provided by the lobby's MatchSettings rather than
		# hardcoded. coup_cost/forced_coup_threshold/assassinate_cost drive
		# _get_options() below; income_coins/foreign_aid_coins/extort_coins/
		# tax_coins/exchange_draw_cards are applied directly in make_action().
		self.cards_per_player = cards_per_player
		self.character_copies = character_copies
		self.starting_coins = starting_coins
		self.coup_cost = coup_cost
		self.forced_coup_threshold = forced_coup_threshold
		self.assassinate_cost = assassinate_cost
		self.income_coins = income_coins
		self.foreign_aid_coins = foreign_aid_coins
		self.extort_coins = extort_coins
		self.tax_coins = tax_coins
		self.self_conversion_coins = self_conversion_coins
		self.force_conversion_coins = force_conversion_coins
		self.exchange_draw_cards = exchange_draw_cards
		self.inquisitor_exchange_draw_cards = inquisitor_exchange_draw_cards
		self.reformation = reformation
		self.declared_coup = declared_coup
		self.declared_assassinate = declared_assassinate

		self.deck: Deck = Deck(self.character_copies, self.base_cards)
        
		self.treasury = 0 # it receives religion conversion costs and is used for embezzle
		
	@staticmethod
	def _blank_turn_description() -> TurnDescription:
		return {
			"source_id": None,
			"target_id": None,
			"action": None,
			"blocker_id": None,
			"challenger_id": None,
			"declared_card": None,
			"exchange_player_id": None,
			"exchange_return_count": None,
			"players_passed_action": [],
			"players_passed_block": [],
			"block_claimed_card": None,
			"card_loss_player_id": None,
			"pending_resolution": None,
		}
	
	def _action_needs_declared_card(self, action: Action) -> bool:
		return (
            (action == Action.COUP and self.declared_coup)
            or (action == Action.ASSASSINATE and self.declared_assassinate)
        )
	
    # Returns a player's possible options given their number of coins.
    # Thresholds come from this match's own ruleset (self.coup_cost,
    # self.forced_coup_threshold, self.assassinate_cost) instead of a
    # hardcoded 10 / 7 / 3, so a lobby with a custom coup cost or forced-coup
    # threshold actually changes what's playable. This is the single source
    # of truth for action affordability; Player has no equivalent method.
	def _get_options(self, player_id: str) -> list[Action]:
		player = self.players[player_id]
		if player.coins >= self.forced_coup_threshold:
			return [Action.COUP]
		
        # options with no cost
		options = [
            Action.INCOME,
            Action.FOREIGN_AID,
            Action.TAX,
            Action.STEAL,
		]

        # Adds actions based on the player's coins
		if player.coins >= self.coup_cost:
			options.append(Action.COUP)
		if player.coins >= self.assassinate_cost:
			options.append(Action.ASSASSINATE)
		if self.reformation:
			options += [Action.EXAMINE, Action.INQUISITOR_EXCHANGE]
			if player.coins >= self.self_conversion_coins:
				options.append(Action.SELF_CONVERSION)
			if player.coins >= self.force_conversion_coins:
				options.append(Action.FORCE_CONVERSION)
			if self.treasury > 0:
				options.append(Action.EMBEZZLE)
		else:
			options.append(Action.EXCHANGE)

		return options
		
	def _get_alive_religions_count(self) -> int:
		return len({player.religion for player in self.players.values() if player.alive})

	# Adds coins to a player in the match
	def _add_coins_to_player(self, player_id: str, coins: int) -> None:
		self.players[player_id].coins += coins

	# Steals coins from target_id and gives them to source_id
	def _steal_coins(self, source_id: str, target_id: str, coins: int) -> None:
		if self.players[target_id].coins < coins:
			raise ValueError("The target player does not have enough coins.")
		self._add_coins_to_player(source_id, coins)
		self._add_coins_to_player(target_id, -coins)

	def _change_religion(self, player_id: str):
		player = self.players[player_id]
		current_idx = self.base_religions.index(player.religion)
		next_idx = (current_idx + 1) % len(self.base_religions)
		player.religion = self.base_religions[next_idx]

	def _resolve_declared_reveal(self) -> dict[str, Any]:
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		target_id = self.turn_description["target_id"]
		declared_card = self.turn_description["declared_card"]
		target = self.players[target_id]
		revealed_cards = list(target.cards)
		lost_card = None

		if declared_card in target.cards:
			target.cards.remove(declared_card)
			target.lost_cards.append(declared_card)
			lost_card = declared_card

		reveal = {
			"player_id": target_id,
			"cards": revealed_cards,
			"declared_card": declared_card,
			"lost_card": lost_card,
		}
		if not target.alive:
			self.status["current_match_state"] = MatchEvent.TURN_RESOLVED
			return {
				"event": MatchEvent.TURN_RESOLVED,
				"action": action,
				"source_id": source_id,
				"target_id": target_id,
				"declared_card": declared_card,
				"lost_card": lost_card,
				"reveal": reveal,
			}

		return self._start_exchange(target_id, reveal)
	
	def _start_exchange(self, player_id: str, reveal: dict[str, Any] | None = None) -> dict[str, Any]:
		if self.reformation:
			draw_cards = self.inquisitor_exchange_draw_cards
		else:
			draw_cards = self.exchange_draw_cards
		new_cards = [self.deck.pop_card() for _ in range(draw_cards)]
		self.players[player_id].cards += new_cards
		self.turn_description["exchange_player_id"] = player_id
		self.turn_description["exchange_return_count"] = draw_cards
		self.status["current_match_state"] = MatchEvent.WAITING_EXCHANGE
		event = {
			"event": MatchEvent.WAITING_EXCHANGE,
			"action": self.turn_description["action"] or Action.EXCHANGE,
			"player_id": player_id,
			"new_cards": new_cards,
			"cards": self.players[player_id].cards,
			"return_count": draw_cards,
		}
		if reveal:
			event["reveal"] = reveal
		return event

	def _start_examine(self, player_id: str, target_id: str, reveal: dict[str, Any] | None = None) -> dict[str, Any]:
		self.status["current_match_state"] = MatchEvent.WAITING_EXAMINE_CARD_SELECTION
		return {
			"event": MatchEvent.WAITING_EXAMINE_CARD_SELECTION,
			"action": self.turn_description["action"] or Action.EXAMINE,
			"player_id": player_id,
			"target_id": target_id
		}