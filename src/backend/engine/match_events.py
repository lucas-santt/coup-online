from typing import Any
from collections import Counter
from backend.engine.enums import (
	BLOCK_CLAIMS,
	BLOCKABLE_ACTIONS,
	CHALLENGEABLE_ACTIONS,
	TARGETED_ACTIONS,
	TARGETED_BLOCK_ONLY_ACTIONS,
	UNCONTESTABLE_ACTIONS,
    ACTION_RESTRICTIONS_AMONG_FELLOWS,
    BLOCK_RESTRICTIONS_AMONG_FELLOWS,
	Action,
	Card,
	ClientEvent,
	MatchEvent,
)
from backend.engine.match_state import MatchState

class MatchEventProcessor:
    def __init__(self, state: MatchState):
        self.state = state

    # Processes events related to player actions and challenges
    def process_event(self, player_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        current_state = self.state.status["current_match_state"]

        if not self.state.players[player_id].alive:
            raise ValueError("You can not make anything while you are dead.")

        if current_state == MatchEvent.WAITING_ACTION:
            return self._process_event_while_waiting_action(player_id, data)
        if current_state == MatchEvent.ACTION_DECLARED:
            return self._process_event_while_action_declared(player_id, data)
        if current_state == MatchEvent.BLOCK_DECLARED:
            return self._process_event_while_block_declared(player_id, data)
        if current_state == MatchEvent.WAITING_CARD_LOSS:
            return self._process_event_while_card_loss(player_id, data)
        if current_state == MatchEvent.WAITING_EXCHANGE:
            return self._process_event_while_waiting_exchange(player_id, data)
        if current_state == MatchEvent.WAITING_EXAMINE_CARD_SELECTION:
            return self._process_event_while_waiting_examine_card_selection(player_id, data)
        if current_state == MatchEvent.WAITING_EXAMINE_DECISION:
            return self._process_event_while_waiting_examine_decision(player_id, data)
        # ACTION_CHALLENGE_CONFIRMED / BLOCK_CHALLENGE_CONFIRMED: no further
        # player input is expected here -- the caller is expected to call
        # resolve_action_challenge()/resolve_block_challenge() directly
        # the moment it sees either event, the same way it chains
        # ACTION_CONFIRMED into make_action() and TURN_RESOLVED into
        # new_turn(). Nothing should reach process_event() while the match
        # is in either state; this is just a safe no-op if it somehow does.
        return None

    # Processes the action while the state is WAITING_ACTION
    def _process_event_while_waiting_action(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        event = data.get("event")
        action = data.get("action")
        target_id = data.get("target_id")
        declared_card = data.get("declared_card")

        # Catch errors
        if event != ClientEvent.CHOSEN_ACTION:
            raise ValueError("You can not do it right now.")
        if player_id != self.state.order[self.state.turn_id]:
            raise ValueError("It is not your turn.")
        if action not in self.state._get_options(player_id):
            raise ValueError("This is not a valid option or you do not have enough money.")
        if action in TARGETED_ACTIONS:
            # If the target is not in the game, is dead, or is the source itself
            if target_id not in self.state.order or player_id == target_id or not self.state.players[target_id].alive:
                raise ValueError("You can not do it with this player.")
            if action == Action.STEAL and self.state.players[target_id].coins == 0:
                raise ValueError("You can not steal from a player with no coins.")
        if self.state._action_needs_declared_card(action):
            if declared_card not in Card:
                raise ValueError("You must declare which influence you are targeting.")
            declared_card = Card(declared_card)
        if self.state.reformation:
            if self.state._get_alive_religions_count() > 1 and action in ACTION_RESTRICTIONS_AMONG_FELLOWS and self.state.players[player_id].religion == self.state.players[target_id].religion:
                raise ValueError("You can not attack a fellow party member.")
                    
        # Records the action's description
        self.state.turn_description = self.state._blank_turn_description()
        self.state.turn_description["source_id"] = player_id
        self.state.turn_description["target_id"] = target_id
        self.state.turn_description["action"] = action
        self.state.turn_description["declared_card"] = declared_card

        # If the action can not be blocked or challenged
        if action in UNCONTESTABLE_ACTIONS:
            self.state.status["current_match_state"] = MatchEvent.ACTION_CONFIRMED
        else:
            # The match will wait for each player to confirm or not the action
            self.state.status["current_match_state"] = MatchEvent.ACTION_DECLARED

        # Collects the coins for the assassination, coup and conversions up front. 
        # Uses this match's configured costs (not a hardcoded default) so a lobby 
        # with a custom costs are actually honored here.
        if action == Action.ASSASSINATE:
            self.state._add_coins_to_player(player_id, -self.state.assassinate_cost)
        if action == Action.COUP:
            self.state._add_coins_to_player(player_id, -self.state.coup_cost)
        if action == Action.SELF_CONVERSION:
            self.state._add_coins_to_player(player_id, -self.state.self_conversion_coins)
        if action == Action.FORCE_CONVERSION:
            self.state._add_coins_to_player(player_id, -self.state.force_conversion_coins)
                
        return {
            "event": self.state.status["current_match_state"],
            "action": action,
            "player_id": player_id,
            "target_id": target_id,
            "declared_card": declared_card,
        }

    # Processes the action while the state is ACTION_DECLARED
    def _process_event_while_action_declared(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        event = data.get("event")
        action = self.state.turn_description["action"]
        source_id = self.state.turn_description["source_id"]
        target_id = self.state.turn_description["target_id"]
        declared_card = self.state.turn_description["declared_card"]

        if event not in (ClientEvent.PASS, ClientEvent.BLOCK, ClientEvent.CHALLENGE, ClientEvent.REVEAL_CARDS):
            raise ValueError("You can not do it right now.")

        if event == ClientEvent.REVEAL_CARDS:
            if action != Action.ASSASSINATE or not self.state.declared_assassinate:
                raise ValueError("You can not reveal for this action.")
            if player_id != target_id:
                raise ValueError("Only the target player can reveal.")
            return self.state._resolve_declared_reveal()

        if event == ClientEvent.PASS:
            # Catch errors
            if player_id == source_id:
                raise ValueError("You can not pass your own action.")
            if action == Action.ASSASSINATE and self.state.declared_assassinate and player_id == target_id:
                raise ValueError("You must contest, block, or reveal.")
            if player_id in self.state.turn_description["players_passed_action"]:
                raise ValueError("You have already done this.")

            self.state.turn_description["players_passed_action"].append(player_id)
            players_alive = [p for p in self.state.players.values() if p.alive]

            # if all living players have already passed the action
            if len(self.state.turn_description["players_passed_action"]) >= len(players_alive) - 1:
                self.state.status["current_match_state"] = MatchEvent.ACTION_CONFIRMED
                return {
                    "event": MatchEvent.ACTION_CONFIRMED,
                    "action": action,
                    "player_id": source_id,
                    "target_id": target_id,
                    "declared_card": declared_card,
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
            if self.state.reformation:
                if self.state._get_alive_religions_count() > 1 and action in BLOCK_RESTRICTIONS_AMONG_FELLOWS and self.state.players[source_id].religion == self.state.players[player_id].religion:
                    raise ValueError("You can not block a foreign aid from a fellow party member.")
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

            self.state.turn_description["blocker_id"] = player_id
            self.state.turn_description["block_claimed_card"] = claimed_card
            self.state.turn_description["players_passed_block"] = []
            self.state.status["current_match_state"] = MatchEvent.BLOCK_DECLARED
            return {
                "event": MatchEvent.BLOCK_DECLARED,
                "action": action,
                "player_id": source_id,
                "target_id": target_id,
                "blocker_id": player_id,
                "claimed_card": claimed_card,
                "declared_card": declared_card,
            }

        # event == ClientEvent.CHALLENGE
        if player_id == source_id:
            raise ValueError("You can not challenge your own action.")
        if action not in CHALLENGEABLE_ACTIONS:
            raise ValueError("The current action can not be challenged.")

        self.state.status["current_match_state"] = MatchEvent.ACTION_CHALLENGE_CONFIRMED
        self.state.turn_description["challenger_id"] = player_id

        return {
            "event": MatchEvent.ACTION_CHALLENGE_CONFIRMED,
            "action": action,
            "player_id": source_id,
            "target_id": target_id,
            "challenger_id": player_id,
            "declared_card": declared_card,
        }

    # Processes the action while the state is BLOCK_DECLARED
    def _process_event_while_block_declared(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        event = data.get("event")
        action = self.state.turn_description["action"]
        source_id = self.state.turn_description["source_id"]
        target_id = self.state.turn_description["target_id"]
        blocker_id = self.state.turn_description["blocker_id"]

        if event not in (ClientEvent.PASS, ClientEvent.CHALLENGE):
            raise ValueError("You can not do it right now.")

        if event == ClientEvent.PASS:
            # Catch errors
            if player_id == blocker_id:
                raise ValueError("You can not pass your own block.")
            if player_id in self.state.turn_description["players_passed_block"]:
                raise ValueError("You have already done this.")

            self.state.turn_description["players_passed_block"].append(player_id)
            players_alive = [p for p in self.state.players.values() if p.alive]

            # if all living players have already passed the block
            if len(self.state.turn_description["players_passed_block"]) >= len(players_alive) - 1:
                self.state.status["current_match_state"] = MatchEvent.BLOCK_CONFIRMED
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

        self.state.status["current_match_state"] = MatchEvent.BLOCK_CHALLENGE_CONFIRMED
        self.state.turn_description["challenger_id"] = player_id

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
    def _process_event_while_card_loss(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        event = data.get("event")
        card_loss_player_id = self.state.turn_description["card_loss_player_id"]
        pending_resolution = self.state.turn_description["pending_resolution"]
        action = self.state.turn_description["action"]
        source_id = self.state.turn_description["source_id"]
        target_id = self.state.turn_description["target_id"]

        # Catch errors
        if player_id != card_loss_player_id:
            raise ValueError("It is not your turn.")
        if event != ClientEvent.SELECTED_CARD:
            raise ValueError("You must choose one card to lose.")

        selected_card = data.get("selected_card")
        selected_card = Card(selected_card)
        player = self.state.players[player_id]
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
            self.state.status["current_match_state"] = MatchEvent.ACTION_CONFIRMED
            return {
                "event": MatchEvent.ACTION_CONFIRMED,
                "action": action,
                "player_id": source_id,
                "target_id": target_id,
                "lost_card": selected_card,
                "loser_id": player_id,
            }

        self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
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
    def _process_event_while_waiting_exchange(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        event = data.get("event")
        exchange_player_id = self.state.turn_description["exchange_player_id"] or self.state.turn_description["source_id"]
        return_count = self.state.turn_description["exchange_return_count"] or self.state.exchange_draw_cards
        selected_cards = data.get("selected_cards")
        selected_cards = [Card(c) for c in selected_cards] if selected_cards else []

        # Catch errors
        if player_id != exchange_player_id:
            raise ValueError("It is not your turn.")
        if event != ClientEvent.SELECTED_CARDS or not selected_cards or len(selected_cards) != return_count:
            raise ValueError(f"You must choose {return_count} cards to return.")

        player = self.state.players[player_id]
        hand_counts = Counter(player.cards)
        selected_counts = Counter(selected_cards)
        if any(selected_counts[card] > hand_counts[card] for card in selected_counts):
            raise ValueError("You need to select cards that you own.")

        for card in selected_cards:
            player.cards.remove(card)
            self.state.deck.push_card(card)
        self.state.deck.shuffle()
        self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
        return {
            "event": MatchEvent.TURN_RESOLVED,
            "action": self.state.turn_description["action"] or Action.EXCHANGE,
            "player_id": player_id,
        }

    # Processes the action while the state is WAITING_EXAMINE_CARD_SELECTION
    def _process_event_while_waiting_examine_card_selection(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        target_id = self.state.turn_description["target_id"]
        if player_id != target_id:
            raise ValueError("It is not your turn.")
        
        selected_card = Card(data.get("selected_card"))
        if selected_card not in self.state.players[player_id].cards:
            raise ValueError("You need to select a card that you own.")

        self.state.turn_description["declared_card"] = selected_card 
        self.state.status["current_match_state"] = MatchEvent.WAITING_EXAMINE_DECISION
        return {
            "event": MatchEvent.WAITING_EXAMINE_DECISION,
            "player_id": self.state.turn_description["source_id"],
            "target_id": target_id,
            "revealed_card": selected_card
        }
    
    # Processes the action while the state is WAITING_EXCHANGE_DECISION
    def _process_event_while_waiting_examine_decision(self, player_id: str, data: dict[str, Any]) -> dict[str, Any]:
        source_id = self.state.turn_description["source_id"]
        
        if player_id != source_id:
            raise ValueError("It is not your turn.")
        
        force_exchange = data.get("force_exchange", False)
        target_id = self.state.turn_description["target_id"]
        target_player = self.state.players[target_id]
        revealed_card = self.state.turn_description["declared_card"]
        
        if force_exchange:
            target_player.cards.remove(revealed_card)
            self.state.deck.push_card(revealed_card)
            self.state.deck.shuffle()
            target_player.cards.append(self.state.deck.pop_card())
        
        self.state.status["current_match_state"] = MatchEvent.TURN_RESOLVED
        return {
            "event": MatchEvent.TURN_RESOLVED,
            "action": self.state.turn_description["action"],
            "source_id": source_id,
            "target_id": target_id,
            "force_exchange": force_exchange
        }