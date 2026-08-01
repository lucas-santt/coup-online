import pytest
from backend.engine.match_state import MatchState
from backend.engine.player import Player
from backend.engine.enums import Action, Card, Religion, MatchEvent

class TestMatchState:
    def _get_standard_players(self) -> list[Player]:
        return [
            Player(id="PLAYER1", displayname="João", avatar_url="", coins=2),
            Player(id="PLAYER2", displayname="Maria", avatar_url="", coins=2)
        ]

    def test_init_validations(self):
        # Tests starting a game with one player
        with pytest.raises(ValueError, match="At least 2 players are required"):
            MatchState(id="MATCH_0350", players=[Player(id="P1", displayname="P1", avatar_url="")])

        # Tests starting a game with eleven player
        many_players = [Player(id=f"P{i}", displayname=f"P{i}", avatar_url="") for i in range(11)]
        with pytest.raises(ValueError, match="A match can have at most 10 players"):
            MatchState(id="MATCH_0350", players=many_players)

        # Tests starting a game with few cards
        base_cards = [Card.DUKE, Card.ASSASSIN, Card.CAPTAIN, Card.AMBASSADOR, Card.CONTESSA]
        with pytest.raises(ValueError, match="character_copies is too small"):
            MatchState(
                id="MATCH_0350", 
                players=self._get_standard_players(), 
                base_cards=base_cards,
                character_copies=1 
            )

    def test_blank_turn_description(self):
        blank = MatchState._blank_turn_description()
        assert blank["action"] is None
        assert blank["players_passed_action"] == []
        assert blank["card_loss_player_id"] is None

    def test_action_needs_declared_card(self):
        state = MatchState(
            id="MATCH_0350", 
            players=self._get_standard_players(),
            declared_coup=True, 
            declared_assassinate=False
        )
        assert state._action_needs_declared_card(Action.COUP) is True
        assert state._action_needs_declared_card(Action.ASSASSINATE) is False
        assert state._action_needs_declared_card(Action.TAX) is False

    def test_get_options(self):
        state = MatchState(id="MATCH_0350", players=self._get_standard_players(), reformation=True)
        player = state.players["PLAYER1"]
        
        # Tests when player has 0 coins
        player.coins = 0
        options = state._get_options("PLAYER1")
        assert Action.INCOME in options and Action.COUP not in options
        
        # Tests when player has 3 coins
        player.coins = 3
        options = state._get_options("PLAYER1")
        assert Action.ASSASSINATE in options and Action.SELF_CONVERSION in options and Action.EMBEZZLE not in options
        
        # Tests when whean treasury has coins
        assert Action.EMBEZZLE not in options
        state.treasury = 1
        options = state._get_options("PLAYER1")
        assert Action.EMBEZZLE in options
        
        # Tests when player has 7 coins
        player.coins = 7
        options = state._get_options("PLAYER1")
        assert Action.COUP in options
        
        # Tests when player has 10 coins
        player.coins = 10
        options = state._get_options("PLAYER1")
        assert options == [Action.COUP]

    def test_steal_coins(self):
        state = MatchState(id="MATCH_0350", players=self._get_standard_players())

        # Tests stealing more than the target has
        with pytest.raises(ValueError, match="The target player does not have enough coins."):
            state._steal_coins("PLAYER1", "PLAYER2", 3)
            
        # Tests successfully stealing
        state._steal_coins("PLAYER1", "PLAYER2", 2)
        assert state.players["PLAYER1"].coins == 4
        assert state.players["PLAYER2"].coins == 0

    def test_religions_mechanics(self):
        players = self._get_standard_players()
        players[0].cards = [Card.DUKE]
        players[1].cards = [Card.ASSASSIN]
        players[0].religion = Religion.LOYALIST       
        players[1].religion = Religion.REFORMIST
        state = MatchState(
            id="MATCH_0350", 
            players=players
        )
        
        # Tests get_alive_religions_count
        assert state._get_alive_religions_count() == 2
        state.players["PLAYER2"].cards = []
        assert state._get_alive_religions_count() == 1
        
        # Tests change_religion
        state._change_religion("PLAYER1")
        assert state.players["PLAYER1"].religion == Religion.REFORMIST

    def test_resolve_declared_reveal(self):
        state = MatchState(id="MATCH_0350", players=self._get_standard_players())
        state.players["PLAYER2"].cards = [Card.DUKE, Card.ASSASSIN]
        state.turn_description["action"] = Action.ASSASSINATE
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        state.turn_description["declared_card"] = Card.DUKE
        
        # Tests when the player has the declared card and has two cards
        res = state._resolve_declared_reveal()
        assert res["event"] == MatchEvent.WAITING_EXCHANGE
        assert Card.DUKE in state.players["PLAYER2"].lost_cards
        assert res["reveal"]["lost_card"] == Card.DUKE
        
        # Tests when the player has the declared card and has one cards
        state.players["PLAYER2"].cards = [Card.ASSASSIN]
        state.turn_description["declared_card"] = Card.ASSASSIN
        res = state._resolve_declared_reveal()
        assert res["event"] == MatchEvent.TURN_RESOLVED
        assert res["lost_card"] == Card.ASSASSIN
        assert not state.players["PLAYER2"].alive
        
        # Tests when the player does not have the declared card
        state.players["PLAYER1"].cards = [Card.CONTESSA]
        state.turn_description["target_id"] = "PLAYER1"
        state.turn_description["declared_card"] = Card.DUKE
        res = state._resolve_declared_reveal()
        assert res["event"] == MatchEvent.WAITING_EXCHANGE
        assert res["reveal"]["lost_card"] is None

    def test_start_exchange(self):
        state = MatchState(id="MATCH_0350", players=self._get_standard_players())
        state.players["PLAYER1"].cards = [Card.DUKE]
        state.turn_description["action"] = Action.EXCHANGE
        res = state._start_exchange("PLAYER1")
        assert res["event"] == MatchEvent.WAITING_EXCHANGE
        assert state.turn_description["exchange_player_id"] == "PLAYER1"
        assert state.turn_description["exchange_return_count"] == 2
        assert len(state.players["PLAYER1"].cards) == 3

    def test_start_examine(self):
        state = MatchState(id="MATCH_0350", players=self._get_standard_players())
        state.turn_description["action"] = Action.EXAMINE
        res = state._start_examine("PLAYER1", "PLAYER2")
        assert res["event"] == MatchEvent.WAITING_EXAMINE_CARD_SELECTION
        assert res["target_id"] == "PLAYER2"
        assert state.status["current_match_state"] == MatchEvent.WAITING_EXAMINE_CARD_SELECTION