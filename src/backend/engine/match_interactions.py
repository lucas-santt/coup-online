from typing import Any
from backend.engine.enums import Action, Card, MatchEvent, ACTION_CLAIMS
from backend.engine.player import Player
from backend.engine.match_state import MatchState

class MatchInteractionResolver:
	def __init__(self, state: MatchState):
		self.state = state
		
    	# Makes the action described in turn_description, given that the action has been confirmed
	def make_action(self) -> dict[str, Any]:
		action = self.state.turn_description["action"]
		source_id = self.state.turn_description["source_id"]
		target_id = self.state.turn_description["target_id"]

		if action == Action.INCOME:
			self.state._add_coins_to_player(source_id, self.state.income_coins)
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.FOREIGN_AID:
			self.state._add_coins_to_player(source_id, self.state.foreign_aid_coins)
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.TAX:
			self.state._add_coins_to_player(source_id, self.state.tax_coins)
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.COUP and self.state.declared_coup:
			return self.state._resolve_declared_reveal()

		if action in (Action.COUP, Action.ASSASSINATE):
			return self._resolve_card_loss(action, source_id, target_id)

		if action == Action.STEAL:
			stolen = min(self.state.extort_coins, self.state.players[target_id].coins)
			self.state._steal_coins(source_id, target_id, stolen)
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.SELF_CONVERSION:
			self.state._change_religion(source_id)
			self.state.treasury += self.state.self_conversion_coins
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.FORCE_CONVERSION:
			self.state._change_religion(target_id)
			self.state.treasury += self.state.force_conversion_coins
			return self._resolve_turn(action, source_id, target_id)
               
		if action == Action.EMBEZZLE:
			self.state._add_coins_to_player(source_id, self.state.treasury)
			self.state.treasury = 0
			return self._resolve_turn(action, source_id, target_id)

		if action == Action.EXAMINE:
			return self.state._start_examine(source_id, target_id)
		
		# action == Action.EXCHANGE or Action.INQUISITOR_EXCHANGE
		return self.state._start_exchange(source_id)

	# Shared by income/foreign_aid/tax/steal/self_conversion/force_conversion/embezzle: 
    # the action just resolves, no card is lost.
	def _resolve_turn(self, action: Action, source_id: str, target_id: str | None) -> dict[str, Any]:
		self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
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
		cards = self.state.players[target_id].cards
		if len(cards) == 0:
			self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
			return {
				"event": MatchEvent.TURN_RESOLVED,
				"action": action,
				"source_id": source_id,
				"target_id": target_id,
				"lost_card": None,
			}	
		if len(cards) == 1:
			lost_card = cards.pop()
			self.state.players[target_id].lost_cards.append(lost_card)
			self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
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
		self.state.turn_description["card_loss_player_id"] = target_id
		self.state.turn_description["pending_resolution"] = None
		self.state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {"event": MatchEvent.WAITING_CARD_LOSS, "player_id": target_id, "cards": cards}

	# Called when a blockable action's block goes unchallenged
	# (BLOCK_CONFIRMED): the block stands and the action never executes.
	def cancel_action(self) -> dict[str, Any]:
		action = self.state.turn_description["action"]
		source_id = self.state.turn_description["source_id"]
		target_id = self.state.turn_description["target_id"]
		self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
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
		action = self.state.turn_description["action"]

		if action == Action.EMBEZZLE:
			return self._resolve_embezzle_challenge()
		
		source_id = self.state.turn_description["source_id"]
		challenger_id = self.state.turn_description["challenger_id"]
		claimed_card = ACTION_CLAIMS[action]
		accused = self.state.players[source_id]

		if claimed_card in accused.cards:
			self._swap_revealed_card(accused, claimed_card)
			self.state.turn_description["card_loss_player_id"] = challenger_id
			self.state.turn_description["pending_resolution"] = "action_proceeds"
			loser_cards = self.state.players[challenger_id].cards
			proven = True
		else:
			self.state.turn_description["card_loss_player_id"] = source_id
			self.state.turn_description["pending_resolution"] = "action_cancelled"
			loser_cards = accused.cards
			proven = False

		self.state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {
			"event": MatchEvent.WAITING_CARD_LOSS,
			"player_id": self.state.turn_description["card_loss_player_id"],
			"cards": loser_cards,
			"reveal": {"player_id": source_id, "card": claimed_card, "proven": proven},
		}

	def _resolve_embezzle_challenge(self) -> dict[str, Any]:
		source_id = self.state.turn_description["source_id"]
		challenger_id = self.state.turn_description["challenger_id"]
		accused = self.state.players[source_id]
		has_duke = Card.DUKE in accused.cards
		if has_duke:
            # The source player lost the challenge
			self.state.turn_description["card_loss_player_id"] = source_id
			self.state.turn_description["pending_resolution"] = "action_cancelled"
			loser_cards = accused.cards
			reveal = {"player_id": source_id, "card": Card.DUKE, "proven": False}
		else:
			# The source player won the challenge
			self.state.turn_description["card_loss_player_id"] = challenger_id
			self.state.turn_description["pending_resolution"] = "action_proceeds"
			loser_cards = self.state.players[challenger_id].cards
            # Changes the source cards
			revealed_cards = list(accused.cards)
			for card in revealed_cards:
				accused.cards.remove(card)
				self.state.deck.push_card(card)
			self.state.deck.shuffle()
            
			for _ in revealed_cards:
				accused.cards.append(self.state.deck.pop_card())
                
			reveal = {"player_id": source_id, "cards": revealed_cards, "proven": True}
		self.state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {
			"event": MatchEvent.WAITING_CARD_LOSS,
			"player_id": self.state.turn_description["card_loss_player_id"],
			"cards": loser_cards,
			"reveal": reveal,
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
		action = self.state.turn_description["action"]
		blocker_id = self.state.turn_description["blocker_id"]
		challenger_id = self.state.turn_description["challenger_id"]
		claimed_card = self.state.turn_description["block_claimed_card"]
		accused = self.state.players[blocker_id]

		if claimed_card in accused.cards:
			self._swap_revealed_card(accused, claimed_card)
			self.state.turn_description["card_loss_player_id"] = challenger_id
			self.state.turn_description["pending_resolution"] = "action_cancelled"
			loser_cards = self.state.players[challenger_id].cards
			proven = True
		else:
			self.state.turn_description["card_loss_player_id"] = blocker_id
			self.state.turn_description["pending_resolution"] = "action_proceeds"
			loser_cards = accused.cards
			proven = False

		self.state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
		return {
			"event": MatchEvent.WAITING_CARD_LOSS,
			"player_id": self.state.turn_description["card_loss_player_id"],
			"cards": loser_cards,
			"reveal": {"player_id": blocker_id, "card": claimed_card, "proven": proven},
		}

	# Shared by both resolve_*_challenge methods above: a challenge a
	# player wins (they really held the claimed card) doesn't cost them
	# influence -- the revealed card goes back into the deck and they draw
	# a fresh one, so they don't end up visibly holding a now-public card.
	def _swap_revealed_card(self, player: Player, revealed_card: Card) -> None:
		player.cards.remove(revealed_card)
		self.state.deck.push_card(revealed_card)
		self.state.deck.shuffle()
		player.cards.append(self.state.deck.pop_card())