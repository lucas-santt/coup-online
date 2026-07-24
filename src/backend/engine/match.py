import random
from typing import Any, TypedDict

from backend import constants
from backend.engine.deck import Deck
from backend.engine.enums import (
	ACTION_CLAIMS,
	BLOCK_CLAIMS,
	BLOCKABLE_ACTIONS,
	CHALLENGEABLE_ACTIONS,
	TARGETED_ACTIONS,
	TARGETED_BLOCK_ONLY_ACTIONS,
	UNCONTESTABLE_ACTIONS,
	Action,
	Card,
	ClientEvent,
	MatchEvent,
)
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


class Match:
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
		exchange_draw_cards: int = constants.MATCH_SETTINGS_SCHEMA["exchange_draw_cards"]["default"],
		reformation: bool = False,
		declared_coup: bool = False,
		declared_assassinate: bool = False,
	) -> None:
		if len(players) < 2:
			raise ValueError("At least 2 players are required to start a match.")
		if len(players) > 10:
			raise ValueError("A match can have at most 10 players.")

		self.id = id
		self.base_cards: list[Card] = base_cards if base_cards is not None else list(Card)

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
		# WAITING_EXCHANGE: a player used the "exchange" action and must return two cards to the deck;
		# TURN_RESOLVED: declares the current turn resolved. The next step is to start a new turn.

		self.turn_description: TurnDescription = self._blank_turn_description()

		# Ruleset values, provided by the lobby's MatchSettings rather than
		# hardcoded. coup_cost/forced_coup_threshold/assassinate_cost drive
		# get_options() below; income_coins/foreign_aid_coins/extort_coins/
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
		self.exchange_draw_cards = exchange_draw_cards
		self.reformation = reformation
		self.declared_coup = declared_coup
		self.declared_assassinate = declared_assassinate

		self.deck: Deck = Deck(self.character_copies, self.base_cards)

	@staticmethod
	def _blank_turn_description() -> TurnDescription:
		return {
			"source_id": None,
			"target_id": None,
			"action": None,
			"blocker_id": None,
			"challenger_id": None,
			"players_passed_action": [],
			"players_passed_block": [],
			"block_claimed_card": None,
			"card_loss_player_id": None,
			"pending_resolution": None,
		}

	# Shuffles turn order and the deck, deals hands, hands out starting
	# coins, and returns the first turn's info.
	def start_match(self) -> dict[str, Any]:
		random.shuffle(self.order)
		self.deck.shuffle()
		self.deal_cards()
		self.give_coins(self.starting_coins)
		self.status["started"] = True
		self.status["current_match_state"] = MatchEvent.WAITING_ACTION
		first_player = self.players[self.order[0]]
		return {
			"event": MatchEvent.NEW_TURN,
			"player": first_player.id,
			"options": self.get_options(first_player.id),
			"last_eliminated": [],
		}

	# Deals cards_per_player cards to each player
	def deal_cards(self) -> None:
		for player_id in self.order:
			for _ in range(self.cards_per_player):
				card = self.deck.pop_card()
				self.players[player_id].cards.append(card)

	# Distributes an equal number of coins to each player
	def give_coins(self, coins: int) -> None:
		for player_id in self.order:
			self.players[player_id].coins = coins

	# Returns the next living player to play
	def next_player(self) -> Player:
		num_players = len(self.order)
		for _ in range(num_players):
			self.turn_id = (self.turn_id + 1) % num_players
			player = self.players[self.order[self.turn_id]]
			if player.alive:
				return player
		raise ValueError("There are no living players in the match.")

	# Returns the ids of players newly eliminated (out of cards) since the
	# last call. Player.alive is derived straight from len(cards) (see
	# engine.player.Player) -- there's no flag to flip here, just a record
	# of who's already been reported, so nobody is announced twice.
	def check_elimination(self) -> list[str]:
		newly_eliminated = [
			player_id
			for player_id in self.order
			if not self.players[player_id].alive and player_id not in self._eliminated
		]
		self._eliminated.update(newly_eliminated)
		return newly_eliminated

	# Checks how many players are alive in the match. If there is only 1 (the winner), returns that player
	def check_winner(self) -> Player | None:
		players_alive = [player for player in self.players.values() if player.alive]
		if len(players_alive) == 0:
			raise ValueError("There are no living players in the game.")
		if len(players_alive) == 1:
			return players_alive[0]
		return None

	# Checks for eliminations, checks if there is a winner, and otherwise returns the next player to play
	def new_turn(self) -> dict[str, Any]:
		self.end_current_turn()
		last_eliminated = self.check_elimination()
		winner = self.check_winner()
		if winner is not None:
			self.status["finished"] = True
			self.status["current_match_state"] = MatchEvent.END_OF_MATCH
			return {
				"event": MatchEvent.END_OF_MATCH,
				"winner": winner.id,
				"last_eliminated": last_eliminated,
			}

		player = self.next_player()
		players = {
			p.id: {"coins": p.coins, "alive": p.alive, "num_cards": len(p.cards)}
			for p in self.players.values()
		}
		return {
			"event": MatchEvent.NEW_TURN,
			"player": player.id,
			"options": self.get_options(player.id),
			"last_eliminated": last_eliminated,
			"players": players,
		}

	# Processes events related to player actions and challenges
	def process_event(self, player_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
		current_state = self.status["current_match_state"]

		if not self.players[player_id].alive:
			raise ValueError("You can not make anything while you are dead.")

		if current_state == MatchEvent.WAITING_ACTION:
			return self.process_event_while_waiting_action(player_id, data)
		if current_state == MatchEvent.ACTION_DECLARED:
			return self.process_event_while_action_declared(player_id, data)
		if current_state == MatchEvent.BLOCK_DECLARED:
			return self.process_event_while_block_declared(player_id, data)
		if current_state == MatchEvent.WAITING_CARD_LOSS:
			return self.process_event_while_card_loss(player_id, data)
		if current_state == MatchEvent.WAITING_EXCHANGE:
			return self.process_event_while_waiting_exchange(player_id, data)
		# ACTION_CHALLENGE_CONFIRMED / BLOCK_CHALLENGE_CONFIRMED: no further
		# player input is expected here -- the caller is expected to call
		# resolve_action_challenge()/resolve_block_challenge() directly
		# the moment it sees either event, the same way it chains
		# ACTION_CONFIRMED into make_action() and TURN_RESOLVED into
		# new_turn(). Nothing should reach process_event() while the match
		# is in either state; this is just a safe no-op if it somehow does.
		return None

	# Processes the action while the state is WAITING_ACTION
	def process_event_while_waiting_action(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
		event = data.get("event")
		action = data.get("action")
		target_id = data.get("target_id")

		# Catch errors
		if event != ClientEvent.CHOSEN_ACTION:
			raise ValueError("You can not do it right now.")
		if player_id != self.order[self.turn_id]:
			raise ValueError("It is not your turn.")
		if action not in self.get_options(player_id):
			raise ValueError("This is not a valid option or you do not have enough money.")
		if action in TARGETED_ACTIONS:
			# If the target is not in the game, is dead, or is the source itself
			if target_id not in self.order or player_id == target_id or not self.players[target_id].alive:
				raise ValueError("You can not do it with this player.")
			if action == Action.STEAL and self.players[target_id].coins == 0:
				raise ValueError("You can not steal from a player with no coins.")

		# Records the action's description
		self.turn_description = self._blank_turn_description()
		self.turn_description["source_id"] = player_id
		self.turn_description["target_id"] = target_id
		self.turn_description["action"] = action

		# If the action can not be blocked or challenged
		if action in UNCONTESTABLE_ACTIONS:
			self.status["current_match_state"] = MatchEvent.ACTION_CONFIRMED
		else:
			# The match will wait for each player to confirm or not the action
			self.status["current_match_state"] = MatchEvent.ACTION_DECLARED

		# Collects the coins for the assassination / coup up front. Uses this
		# match's configured costs (not a hardcoded default) so a lobby with
		# a custom assassinate_cost or coup_cost is actually honored here.
		if action == Action.ASSASSINATE:
			self.add_coins_to_player(player_id, -self.assassinate_cost)
		if action == Action.COUP:
			self.add_coins_to_player(player_id, -self.coup_cost)

		return {
			"event": self.status["current_match_state"],
			"action": action,
			"player_id": player_id,
			"target_id": target_id,
		}

	# Returns a player's possible options given their number of coins.
	# Thresholds come from this match's own ruleset (self.coup_cost,
	# self.forced_coup_threshold, self.assassinate_cost) instead of a
	# hardcoded 10 / 7 / 3, so a lobby with a custom coup cost or forced-coup
	# threshold actually changes what's playable. This is the single source
	# of truth for action affordability; Player has no equivalent method.
	def get_options(self, player_id: str) -> list[Action]:
		player = self.players[player_id]
		if player.coins >= self.forced_coup_threshold:
			return [Action.COUP]
		if player.coins >= self.coup_cost:
			return list(Action)
		if player.coins >= self.assassinate_cost:
			return [action for action in Action if action != Action.COUP]
		return [action for action in Action if action not in (Action.COUP, Action.ASSASSINATE)]

	# Processes the action while the state is ACTION_DECLARED
	def process_event_while_action_declared(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
		event = data.get("event")
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		target_id = self.turn_description["target_id"]

		if event not in (ClientEvent.PASS, ClientEvent.BLOCK, ClientEvent.CHALLENGE):
			raise ValueError("You can not do it right now.")

		if event == ClientEvent.PASS:
			# Catch errors
			if player_id == source_id:
				raise ValueError("You can not pass your own action.")
			if player_id in self.turn_description["players_passed_action"]:
				raise ValueError("You have already done this.")

			self.turn_description["players_passed_action"].append(player_id)
			players_alive = [p for p in self.players.values() if p.alive]

			# if all living players have already passed the action
			if len(self.turn_description["players_passed_action"]) >= len(players_alive) - 1:
				self.status["current_match_state"] = MatchEvent.ACTION_CONFIRMED
				return {
					"event": MatchEvent.ACTION_CONFIRMED,
					"action": action,
					"player_id": source_id,
					"target_id": target_id,
				}
			return {"event": MatchEvent.ACTION_PASS_REGISTERED, "player_id": player_id}

		if event == ClientEvent.BLOCK:
			# Catch errors
			if player_id == source_id:
				raise ValueError("You can not block your own action.")
			if action not in BLOCKABLE_ACTIONS:
				raise ValueError("This action can not be blocked.")
			if action in TARGETED_BLOCK_ONLY_ACTIONS and player_id != target_id:
				raise ValueError("Only the target player can block this.")

			# Which character the blocker claims. Foreign Aid and
			# Assassinate each have exactly one legal claim, but Steal has
			# two (Captain or Ambassador) -- the client must say which one
			# it's claiming rather than the engine picking for it, since
			# that claim is what a later block challenge actually checks
			# the blocker's hand against (see resolve_block_challenge).
			raw_claim = data.get("claimed_card")
			legal_claims = BLOCK_CLAIMS[action]
			if raw_claim not in legal_claims:
				raise ValueError(f"You must claim one of {sorted(legal_claims)} to block this.")
			claimed_card = Card(raw_claim)

			self.turn_description["blocker_id"] = player_id
			self.turn_description["block_claimed_card"] = claimed_card
			self.turn_description["players_passed_block"] = []
			self.status["current_match_state"] = MatchEvent.BLOCK_DECLARED
			return {
				"event": MatchEvent.BLOCK_DECLARED,
				"action": action,
				"player_id": source_id,
				"target_id": target_id,
				"blocker_id": player_id,
				"claimed_card": claimed_card,
			}

		# event == ClientEvent.CHALLENGE
		if player_id == source_id:
			raise ValueError("You can not challenge your own action.")
		if action not in CHALLENGEABLE_ACTIONS:
			raise ValueError("The current action can not be challenged.")

		self.status["current_match_state"] = MatchEvent.ACTION_CHALLENGE_CONFIRMED
		self.turn_description["challenger_id"] = player_id

		return {
			"event": MatchEvent.ACTION_CHALLENGE_CONFIRMED,
			"action": action,
			"player_id": source_id,
			"target_id": target_id,
			"challenger_id": player_id,
		}

	# Processes the action while the state is BLOCK_DECLARED
	def process_event_while_block_declared(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
		event = data.get("event")
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		target_id = self.turn_description["target_id"]
		blocker_id = self.turn_description["blocker_id"]

		if event not in (ClientEvent.PASS, ClientEvent.CHALLENGE):
			raise ValueError("You can not do it right now.")

		if event == ClientEvent.PASS:
			# Catch errors
			if player_id == blocker_id:
				raise ValueError("You can not pass your own block.")
			if player_id in self.turn_description["players_passed_block"]:
				raise ValueError("You have already done this.")

			self.turn_description["players_passed_block"].append(player_id)
			players_alive = [p for p in self.players.values() if p.alive]

			# if all living players have already passed the block
			if len(self.turn_description["players_passed_block"]) >= len(players_alive) - 1:
				self.status["current_match_state"] = MatchEvent.BLOCK_CONFIRMED
				return {
					"event": MatchEvent.BLOCK_CONFIRMED,
					"action": action,
					"player_id": source_id,
					"target_id": target_id,
					"blocker_id": blocker_id,
				}
			return {"event": MatchEvent.BLOCK_PASS_REGISTERED, "player_id": player_id}

		# event == ClientEvent.CHALLENGE
		if player_id == blocker_id:
			raise ValueError("You can not challenge your own block.")

		self.status["current_match_state"] = MatchEvent.BLOCK_CHALLENGE_CONFIRMED
		self.turn_description["challenger_id"] = player_id

		return {
			"event": MatchEvent.BLOCK_CHALLENGE_CONFIRMED,
			"action": action,
			"player_id": source_id,
			"target_id": target_id,
			"blocker_id": blocker_id,
			"challenger_id": player_id,
		}

	# Processes the action while the state is WAITING_CARD_LOSS. The player
	# choosing isn't necessarily the action's target -- a challenge can
	# send the source, the blocker, or the challenger here instead (see
	# resolve_action_challenge/resolve_block_challenge), so this checks
	# card_loss_player_id rather than target_id.
	def process_event_while_card_loss(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
		event = data.get("event")
		card_loss_player_id = self.turn_description["card_loss_player_id"]
		pending_resolution = self.turn_description["pending_resolution"]
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		target_id = self.turn_description["target_id"]

		# Catch errors
		if player_id != card_loss_player_id:
			raise ValueError("It is not your turn.")
		if event != ClientEvent.SELECTED_CARD:
			raise ValueError("You must choose one card to lose.")

		selected_card = data.get("selected_card")
		player = self.players[player_id]
		if selected_card not in player.cards:
			raise ValueError("You need to select cards that you own.")
		player.cards.remove(selected_card)
		# This card is genuinely gone (unlike a challenge *defense*, which
		# swaps the revealed card back into the deck instead of landing
		# here at all) -- stays publicly face-up for the rest of the match.
		player.lost_cards.append(selected_card)

		if pending_resolution == "action_proceeds":
			# The challenged claim was vindicated (or a fake block was
			# caught) -- the original action still needs to execute.
			# Returning an ACTION_CONFIRMED-shaped event lets the caller
			# chain straight into make_action() the same way it would for
			# an ordinary unchallenged action, instead of duplicating that
			# dispatch here.
			self.status["current_match_state"] = MatchEvent.ACTION_CONFIRMED
			return {
				"event": MatchEvent.ACTION_CONFIRMED,
				"action": action,
				"player_id": source_id,
				"target_id": target_id,
				"lost_card": selected_card,
				"loser_id": player_id,
			}

		self.status["current_match_state"] = MatchEvent.TURN_RESOLVED
		if pending_resolution == "action_cancelled":
			# The challenged claim was a bluff (or a genuine block stood)
			# -- the action never happens.
			return {
				"event": MatchEvent.TURN_RESOLVED,
				"action": action,
				"player_id": player_id,
				"lost_card": selected_card,
				"action_cancelled": True,
			}

		# pending_resolution is None: an ordinary coup/assassinate hit,
		# already fully resolved by make_action() before this was reached.
		return {
			"event": MatchEvent.TURN_RESOLVED,
			"action": action,
			"player_id": player_id,
			"lost_card": selected_card,
		}

	# Processes the action while the state is WAITING_EXCHANGE
	def process_event_while_waiting_exchange(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
		event = data.get("event")
		source_id = self.turn_description["source_id"]
		selected_cards = data.get("selected_cards")

		# Catch errors
		if player_id != source_id:
			raise ValueError("It is not your turn.")
		if event != ClientEvent.SELECTED_CARDS or not selected_cards or len(selected_cards) != 2:
			raise ValueError("You must choose two cards to return to the deck.")

		player = self.players[player_id]
		for card in selected_cards:
			if card not in player.cards:
				raise ValueError("You need to select cards that you own.")
			player.cards.remove(card)
			self.deck.push_card(card)
		self.deck.shuffle()
		self.status["current_match_state"] = MatchEvent.TURN_RESOLVED
		return {"event": MatchEvent.TURN_RESOLVED, "action": Action.EXCHANGE, "player_id": player_id}

	# Resets the state of the match and starts a new turn
	def end_current_turn(self) -> None:
		self.status["current_match_state"] = MatchEvent.WAITING_ACTION
		self.turn_description = self._blank_turn_description()

	# Makes the action described in turn_description, given that the action has been confirmed
	def make_action(self) -> dict[str, Any]:
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		target_id = self.turn_description["target_id"]

		if action == Action.INCOME:
			self.add_coins_to_player(source_id, self.income_coins)
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.FOREIGN_AID:
			self.add_coins_to_player(source_id, self.foreign_aid_coins)
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.TAX:
			self.add_coins_to_player(source_id, self.tax_coins)
			return self._resolve_turn(action, source_id, target_id)

		if action in (Action.COUP, Action.ASSASSINATE):
			return self._resolve_card_loss(action, source_id, target_id)

		if action == Action.STEAL:
			stolen = min(self.extort_coins, self.players[target_id].coins)
			self.steal_coins(source_id, target_id, stolen)
			return self._resolve_turn(action, source_id, target_id)

		# action == Action.EXCHANGE
		new_cards = [self.deck.pop_card() for _ in range(self.exchange_draw_cards)]
		self.players[source_id].cards += new_cards
		self.status["current_match_state"] = MatchEvent.WAITING_EXCHANGE
		return {
			"event": MatchEvent.WAITING_EXCHANGE,
			"player_id": source_id,
			"new_cards": new_cards,
			"cards": self.players[source_id].cards,
		}

	# Shared by income/foreign_aid/tax/steal: the action just resolves, no
	# card is lost.
	def _resolve_turn(self, action: Action, source_id: str, target_id: str | None) -> dict[str, Any]:
		self.status["current_match_state"] = MatchEvent.TURN_RESOLVED
		return {
			"event": MatchEvent.TURN_RESOLVED,
			"action": action,
			"source_id": source_id,
			"target_id": target_id,
			"lost_card": None,
		}

	# Shared by coup/assassinate: the target loses a card outright if they
	# only have one left, otherwise they're asked which one to give up.
	def _resolve_card_loss(self, action: Action, source_id: str, target_id: str) -> dict[str, Any]:
		cards = self.players[target_id].cards
		if len(cards) == 1:
			lost_card = cards.pop()
			self.players[target_id].lost_cards.append(lost_card)
			self.status["current_match_state"] = MatchEvent.TURN_RESOLVED
			return {
				"event": MatchEvent.TURN_RESOLVED,
				"action": action,
				"source_id": source_id,
				"target_id": target_id,
				"lost_card": lost_card,
			}
		# card_loss_player_id/pending_resolution: this is an ordinary hit,
		# not a challenge outcome. pending_resolution must be reset here,
		# not just left whatever it was -- a failed challenge earlier in
		# this same turn can leave it as "action_proceeds", and without
		# this reset that stale value would make process_event_while_card_loss
		# think *this* card loss is a challenge outcome too, re-trigger
		# make_action(), and cost the target a second card for one hit.
		self.turn_description["card_loss_player_id"] = target_id
		self.turn_description["pending_resolution"] = None
		self.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {"event": MatchEvent.WAITING_CARD_LOSS, "player_id": target_id, "cards": cards}

	# Called when a blockable action's block goes unchallenged
	# (BLOCK_CONFIRMED): the block stands and the action never executes.
	def cancel_action(self) -> dict[str, Any]:
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		target_id = self.turn_description["target_id"]
		self.status["current_match_state"] = MatchEvent.TURN_RESOLVED
		return {
			"event": MatchEvent.TURN_RESOLVED,
			"action": action,
			"source_id": source_id,
			"target_id": target_id,
			"lost_card": None,
			"action_cancelled": True,
		}

	# Resolves an ACTION_CHALLENGE_CONFIRMED state: someone has challenged
	# the actor's claim to the character their action requires. Called by
	# the caller (the in-match router) immediately after seeing that
	# event -- there's no further player input needed to know the
	# outcome, only whose hand to check.
	#
	# If the actor really holds the claimed card, they reveal it, it's
	# reshuffled back into the deck, and they draw a replacement (so they
	# don't end up visibly holding the same card they just proved they
	# have) -- the challenger guessed wrong and loses a card instead, then
	# the action proceeds as if it had never been challenged. If the actor
	# doesn't hold it, the actor loses a card and the action never
	# happens. Either way this hands off to WAITING_CARD_LOSS; which of
	# those two continuations happens once that card is chosen is decided
	# by pending_resolution, not here.
	def resolve_action_challenge(self) -> dict[str, Any]:
		action = self.turn_description["action"]
		source_id = self.turn_description["source_id"]
		challenger_id = self.turn_description["challenger_id"]
		claimed_card = ACTION_CLAIMS[action]
		accused = self.players[source_id]

		if claimed_card in accused.cards:
			self._swap_revealed_card(accused, claimed_card)
			self.turn_description["card_loss_player_id"] = challenger_id
			self.turn_description["pending_resolution"] = "action_proceeds"
			loser_cards = self.players[challenger_id].cards
			proven = True
		else:
			self.turn_description["card_loss_player_id"] = source_id
			self.turn_description["pending_resolution"] = "action_cancelled"
			loser_cards = accused.cards
			proven = False

		self.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {
			"event": MatchEvent.WAITING_CARD_LOSS,
			"player_id": self.turn_description["card_loss_player_id"],
			"cards": loser_cards,
			"reveal": {"player_id": source_id, "card": claimed_card, "proven": proven},
		}

	# Resolves a BLOCK_CHALLENGE_CONFIRMED state: someone has challenged
	# the blocker's claim to the character their block requires. Mirrors
	# resolve_action_challenge, but checks the *blocker's* hand against
	# whichever character they claimed (turn_description's
	# block_claimed_card -- fixed for Foreign Aid/Assassinate, but a real
	# choice the blocker made for Steal).
	#
	# Vindicated (block claim was real): the challenger loses a card, the
	# block stands, the action never happens. Bluffed: the blocker loses a
	# card, the block is void, and the action proceeds after all.
	def resolve_block_challenge(self) -> dict[str, Any]:
		action = self.turn_description["action"]
		blocker_id = self.turn_description["blocker_id"]
		challenger_id = self.turn_description["challenger_id"]
		claimed_card = self.turn_description["block_claimed_card"]
		accused = self.players[blocker_id]

		if claimed_card in accused.cards:
			self._swap_revealed_card(accused, claimed_card)
			self.turn_description["card_loss_player_id"] = challenger_id
			self.turn_description["pending_resolution"] = "action_cancelled"
			loser_cards = self.players[challenger_id].cards
			proven = True
		else:
			self.turn_description["card_loss_player_id"] = blocker_id
			self.turn_description["pending_resolution"] = "action_proceeds"
			loser_cards = accused.cards
			proven = False

		self.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {
			"event": MatchEvent.WAITING_CARD_LOSS,
			"player_id": self.turn_description["card_loss_player_id"],
			"cards": loser_cards,
			"reveal": {"player_id": blocker_id, "card": claimed_card, "proven": proven},
		}

	# Shared by both resolve_*_challenge methods above: a challenge a
	# player wins (they really held the claimed card) doesn't cost them
	# influence -- the revealed card goes back into the deck and they draw
	# a fresh one, so they don't end up visibly holding a now-public card.
	def _swap_revealed_card(self, player: Player, revealed_card: Card) -> None:
		player.cards.remove(revealed_card)
		self.deck.push_card(revealed_card)
		self.deck.shuffle()
		player.cards.append(self.deck.pop_card())

	# Adds coins to a player in the match
	def add_coins_to_player(self, player_id: str, coins: int) -> None:
		self.players[player_id].coins += coins

	# Steals coins from target_id and gives them to source_id
	def steal_coins(self, source_id: str, target_id: str, coins: int) -> None:
		if self.players[target_id].coins < coins:
			raise ValueError("The target player does not have enough coins.")
		self.add_coins_to_player(source_id, coins)
		self.add_coins_to_player(target_id, -coins)