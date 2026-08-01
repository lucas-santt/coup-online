import pytest
from backend.engine.match_state import MatchState
from backend.engine.match_interactions import MatchInteractionResolver
from backend.engine.player import Player
from backend.engine.enums import Action, MatchEvent, Card, Religion

class TestMatchInteractions:
    def _setup_resolver(self):
        player1 = Player(id="PLAYER1", displayname="João", avatar_url="", coins=2)
        player2 = Player(id="PLAYER2", displayname="Maria", avatar_url="", coins=2)
        
        state = MatchState(
            id="MATCH_0350", 
            players=[player1, player2],
            base_religions=[Religion.LOYALIST, Religion.REFORMIST]
        )
        state.players["PLAYER1"].religion = Religion.LOYALIST
        state.players["PLAYER2"].religion = Religion.REFORMIST
        
        return state, MatchInteractionResolver(state)

    def test_make_action_income_foreign_tax(self):
        state, resolver = self._setup_resolver()
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = None
        
        # Tests INCOME
        state.turn_description["action"] = Action.INCOME
        resolver.make_action()
        assert state.players["PLAYER1"].coins == 3
        
        # Tests FOREIGN_AID
        state.turn_description["action"] = Action.FOREIGN_AID
        resolver.make_action()
        assert state.players["PLAYER1"].coins == 5
        
        # tests TAX
        state.turn_description["action"] = Action.TAX
        resolver.make_action()
        assert state.players["PLAYER1"].coins == 8

    def test_make_action_steal_and_exchange(self) -> None:
        state, resolver = self._setup_resolver()
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        
        # Tests STEAL
        state.turn_description["action"] = Action.STEAL
        resolver.make_action()
        assert state.players["PLAYER1"].coins == 4
        assert state.players["PLAYER2"].coins == 0
        
        # Tests EXCHANGE
        state.turn_description["action"] = Action.EXCHANGE
        res = resolver.make_action()
        assert res["event"] == MatchEvent.WAITING_EXCHANGE

    def test_make_action_religions_and_embezzle(self) -> None:
        state, resolver = self._setup_resolver()
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        
        # Tests SELF_CONVERSION
        state.turn_description["action"] = Action.SELF_CONVERSION
        resolver.make_action()
        assert state.players["PLAYER1"].religion == Religion.REFORMIST
        assert state.treasury == state.self_conversion_coins
        
        # Tests FORCE_CONVERSION
        state.turn_description["action"] = Action.FORCE_CONVERSION
        resolver.make_action()
        assert state.players["PLAYER2"].religion == Religion.LOYALIST
        assert state.treasury == state.self_conversion_coins + state.force_conversion_coins
        
        # Tests EMBEZZLE
        state.turn_description["action"] = Action.EMBEZZLE
        treasury_amount = state.treasury
        resolver.make_action()
        assert state.players["PLAYER1"].coins == 2 + treasury_amount
        assert state.treasury == 0

    def test_resolve_card_loss_scenarios_with_assassinate(self):
        state, resolver = self._setup_resolver()
        state.turn_description["action"] = Action.ASSASSINATE
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        
        # Tests state WAITING_CARD_LOSS (player has two cards)
        state.players["PLAYER2"].cards = [Card.DUKE, Card.ASSASSIN]
        res = resolver.make_action()
        assert res["event"] == MatchEvent.WAITING_CARD_LOSS
        assert state.turn_description["pending_resolution"] is None
        
        # Tests state TURN_RESOLVED (player has one card)
        state.players["PLAYER2"].cards = [Card.DUKE]
        res = resolver.make_action()
        assert res["event"] == MatchEvent.TURN_RESOLVED
        assert res["lost_card"] == Card.DUKE
        assert len(state.players["PLAYER2"].cards) == 0
        
        # When player has zero card
        res = resolver.make_action()
        assert res["event"] == MatchEvent.TURN_RESOLVED
        assert res["lost_card"] is None

    def test_coup_declared(self):
        state, resolver = self._setup_resolver()
        state.declared_coup = True
        state.turn_description["action"] = Action.COUP
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        state.turn_description["declared_card"] = Card.DUKE
        state.players["PLAYER2"].cards = [Card.DUKE, Card.ASSASSIN]
        res = resolver.make_action()
        assert res["event"] == MatchEvent.WAITING_EXCHANGE

    def test_cancel_action(self):
        state, resolver = self._setup_resolver()
        state.turn_description["action"] = Action.TAX
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = None
        res = resolver.cancel_action()
        assert res["action_cancelled"] is True
        assert res["event"] == MatchEvent.TURN_RESOLVED

    def test_resolve_action_challenge(self):
        state, resolver = self._setup_resolver()
        state.turn_description["action"] = Action.TAX
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["challenger_id"] = "PLAYER2"
        # When the source is lying
        state.players["PLAYER1"].cards = [Card.ASSASSIN]
        res = resolver.resolve_action_challenge()
        assert res["reveal"]["proven"] is False
        assert state.turn_description["card_loss_player_id"] == "PLAYER1"
        assert state.turn_description["pending_resolution"] == "action_cancelled"
        # When the source is not lying
        state.players["PLAYER1"].cards = [Card.DUKE]
        res = resolver.resolve_action_challenge()
        assert res["reveal"]["proven"] is True
        assert state.turn_description["card_loss_player_id"] == "PLAYER2"
        assert state.turn_description["pending_resolution"] == "action_proceeds"

    def test_resolve_embezzle_challenge(self):
        state, resolver = self._setup_resolver()
        state.turn_description["action"] = Action.EMBEZZLE
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["challenger_id"] = "PLAYER2"
        # When the source is lying
        state.players["PLAYER1"].cards = [Card.DUKE]
        res_has_duke = resolver.resolve_action_challenge()
        assert res_has_duke["reveal"]["proven"] is False
        assert state.turn_description["pending_resolution"] == "action_cancelled"
        # When the source is not lying
        state.players["PLAYER1"].cards = [Card.ASSASSIN]
        res = resolver.resolve_action_challenge()
        assert res["reveal"]["proven"] is True
        assert state.turn_description["pending_resolution"] == "action_proceeds"

    def test_resolve_block_challenge(self):
        state, resolver = self._setup_resolver()
        state.turn_description["action"] = Action.STEAL
        state.turn_description["blocker_id"] = "PLAYER2"
        state.turn_description["challenger_id"] = "PLAYER1"
        state.turn_description["block_claimed_card"] = Card.CAPTAIN
        # When the blocker is lying
        state.players["PLAYER2"].cards = [Card.ASSASSIN]
        res = resolver.resolve_block_challenge()
        assert res["reveal"]["proven"] is False
        assert state.turn_description["card_loss_player_id"] == "PLAYER2"
        assert state.turn_description["pending_resolution"] == "action_proceeds"
        # When the blocker is not lying
        state.players["PLAYER2"].cards = [Card.CAPTAIN]
        res = resolver.resolve_block_challenge()
        assert res["reveal"]["proven"] is True
        assert state.turn_description["card_loss_player_id"] == "PLAYER1"
        assert state.turn_description["pending_resolution"] == "action_cancelled"

    def test_make_action_inquisitor(self):
        state, resolver = self._setup_resolver()
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        # Tests examine
        state.turn_description["action"] = Action.EXAMINE
        res_examine = resolver.make_action()
        assert res_examine["event"] == MatchEvent.WAITING_EXAMINE_CARD_SELECTION
        # Tests exchange
        state.turn_description["action"] = Action.INQUISITOR_EXCHANGE
        res_exchange = resolver.make_action()
        assert res_exchange["event"] == MatchEvent.WAITING_EXCHANGE