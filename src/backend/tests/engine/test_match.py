import pytest
from backend.engine.match import Match
from backend.engine.player import Player
from backend.engine.enums import MatchEvent, Action, Religion, Card, ClientEvent

class TestMatch:
    def _standard_players(self):
        return [
                Player(id="PLAYER1", displayname="João", avatar_url=""),
                Player(id="PLAYER2", displayname="Maria", avatar_url="")
            ]

    def test_init(self):
        # Tests init match
        match = Match(id="MATCH_0350", players=self._standard_players())
        assert match.id == "MATCH_0350"
        assert len(match.players) == 2
        assert match.status["started"] is False
        assert match.turn_id == 0
        assert match.order == ["PLAYER1", "PLAYER2"]
        assert match.turn_description["action"] is None

    def test_start(self):
        # Successfully start a classic match
        match = Match(id="MATCH_0351", players=self._standard_players())
        match.start_match()
        assert match.state.character_copies == 3
        assert match.status["started"] is True
        assert match.status["current_match_state"] == MatchEvent.WAITING_ACTION
        assert match.players["PLAYER1"].coins == 2
        assert len(match.players["PLAYER1"].cards) == 2
        # Successfully starts a remormation match
        match_reformation = Match(id="MATCH_0351", players=self._standard_players(), reformation=True)
        match_reformation.start_match()
        assert match_reformation.players["PLAYER1"].religion in list(Religion)
        assert match_reformation.players["PLAYER2"].religion in list(Religion)

    def test_check_winner_and_check_elimination(self):
        match = Match(id="MATCH_0350", players=self._standard_players(), character_copies=5)
        match.start_match() 

        # Tests _check_winner() while there is no winner
        assert match._check_winner() is None

        # Tests _check_elimination while there is an elimination
        match.players["PLAYER2"].cards = []
        match._check_elimination()
        assert(match.players["PLAYER1"].alive and not match.players["PLAYER2"].alive)

        # Tests _check_winner() while there is a winner
        assert(match._check_winner().id == "PLAYER1")

        # Tests _check_winner() while there is no player alive
        match.players["PLAYER1"].cards = []
        match._check_elimination()
        with pytest.raises(ValueError, match="There are no living players in the game."):
            match._check_winner()

    def test_next_player_error(self):
        match = Match(id="MATCH_0350", players=self._standard_players())
        match.start_match()
        match.players["PLAYER1"].cards = []
        match.players["PLAYER2"].cards = []
        with pytest.raises(ValueError, match="There are no living players in the match."):
            match._next_player()

    def test_new_turn(self):
        match = Match(id="MATCH_0350", players=self._standard_players(), character_copies=-1)
        match.start_match()
    
        # Tests new_turn while there is players alive
        current_player_id = match.order[match.turn_id]
        other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
        assert(match.new_turn()["player"] == other_player_id)

    def test_resolution_bridges(self):
        match = Match(id="MATCH_0350", players=self._standard_players())
        match.start_match()
        
        # Tests make_action
        match.state.turn_description["action"] = Action.INCOME
        match.state.turn_description["source_id"] = "PLAYER1"
        ans = match.make_action()
        assert ans["action"] == Action.INCOME
        
        # Tests cancel_action
        match.state.turn_description["target_id"] = "PLAYER2"
        ans = match.cancel_action()
        assert ans["action_cancelled"] is True

        # Tests action_challenge
        match.state.turn_description["action"] = Action.TAX
        match.state.turn_description["challenger_id"] = "PLAYER2"
        match.state.turn_description["blocker_id"] = "PLAYER2"
        match.state.turn_description["block_claimed_card"] = Card.DUKE
        match.players["PLAYER1"].cards = [Card.ASSASSIN]
        match.players["PLAYER2"].cards = [Card.DUKE]
        ans = match.resolve_action_challenge()
        assert ans["event"] == MatchEvent.WAITING_CARD_LOSS

        # Tests Process Event
        match.state.status["current_match_state"] = MatchEvent.WAITING_ACTION
        match.state.turn_id = 0
        current_player_id = match.state.order[0] 
        with pytest.raises(ValueError, match="You can not do it with this player."):
            match.process_event(current_player_id, {"event": ClientEvent.CHOSEN_ACTION, "action": Action.STEAL, "target_id": current_player_id})

        # Tests block_challenge
        match.state.turn_description["action"] = Action.STEAL
        match.state.turn_description["challenger_id"] = "PLAYER1"
        match.state.turn_description["blocker_id"] = "PLAYER2"
        match.state.turn_description["block_claimed_card"] = Card.CAPTAIN
        ans_block = match.resolve_block_challenge()
        assert ans_block["event"] == MatchEvent.WAITING_CARD_LOSS
