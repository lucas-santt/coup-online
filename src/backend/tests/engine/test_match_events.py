import pytest
from backend.engine.match_state import MatchState
from backend.engine.match_events import MatchEventProcessor
from backend.engine.player import Player
from backend.engine.enums import Action, ClientEvent, MatchEvent, Card, Religion

class TestMatchEvents:
    def _setup_processor(self, num_players=3, reformation=False):
        players = []
        for i in range(num_players):
            p = Player(id=f"PLAYER{i+1}", displayname=f"Name{i+1}", avatar_url="", coins=7)
            p.cards = [Card.DUKE, Card.ASSASSIN]
            players.append(p)
        state = MatchState(id="MATCH_0350", players=players, reformation=reformation)
        if reformation:
            state.base_religions = [Religion.LOYALIST, Religion.REFORMIST]
            players[0].religion = Religion.LOYALIST
            players[1].religion = Religion.LOYALIST
            players[2].religion = Religion.REFORMIST
            
        state.order = [p.id for p in players]
        state.turn_id = 0
        return state, MatchEventProcessor(state)

    def test_dead_player(self):
        state, processor = self._setup_processor()
        state.players["PLAYER1"].cards = []
        with pytest.raises(ValueError, match="You can not make anything while you are dead"):
            processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION})

    def test_process_event_while_waiting_action(self) -> None:
        state, processor = self._setup_processor(reformation=True)
        state.status["current_match_state"] = MatchEvent.WAITING_ACTION
        
        # Tests wrong turn
        with pytest.raises(ValueError, match="It is not your turn."):
            processor.process_event("PLAYER2", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.INCOME})
            
        # Tests target yourself
        with pytest.raises(ValueError, match="You can not do it with this player."):
            processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.STEAL, "target_id": "PLAYER1"})

        # Tests steal from a player with no money
        state.players["PLAYER2"].coins = 0
        with pytest.raises(ValueError, match="You can not steal from a player with no coins."):
            processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.STEAL, "target_id": "PLAYER2"})
        state.players["PLAYER2"].coins = 4
        # Tests missing declared card for COUP when declared_coup is True
        state.declared_coup = True
        with pytest.raises(ValueError, match="You must declare which influence you are targeting."):
            processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.COUP, "target_id": "PLAYER3", "declared_card": "invalid"})

        # Tests fellow party member attack restriction
        with pytest.raises(ValueError, match="You can not attack a fellow party member."):
            processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.STEAL, "target_id": "PLAYER2"})

        # Tests uncontestable action jumping straight to ACTION_CONFIRMED
        res = processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.INCOME})
        assert state.status["current_match_state"] == MatchEvent.ACTION_CONFIRMED
        assert res["event"] == MatchEvent.ACTION_CONFIRMED

        # Tests contestable action going to ACTION_DECLARED
        state.status["current_match_state"] = MatchEvent.WAITING_ACTION
        res2 = processor.process_event("PLAYER1", {"event": ClientEvent.CHOSEN_ACTION, "action": Action.TAX})
        assert state.status["current_match_state"] == MatchEvent.ACTION_DECLARED
        assert res2["event"] == MatchEvent.ACTION_DECLARED

    def test_process_event_while_action_declared_passing_and_revealing(self):
        state, processor = self._setup_processor()
        state.status["current_match_state"] = MatchEvent.ACTION_DECLARED
        state.turn_description["action"] = Action.ASSASSINATE
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        state.declared_assassinate = True
        
        # Tests invalid event
        with pytest.raises(ValueError, match="You can not do it right now."):
            processor.process_event("PLAYER2", {"event": ClientEvent.CHOSEN_ACTION})

        # Tests REVEAL_CARDS errors
        with pytest.raises(ValueError, match="Only the target player can reveal."):
            processor.process_event("PLAYER3", {"event": ClientEvent.REVEAL_CARDS})
        state.declared_assassinate = False
        with pytest.raises(ValueError, match="You can not reveal for this action."):
            processor.process_event("PLAYER2", {"event": ClientEvent.REVEAL_CARDS})
            
        # Tests passing own action
        with pytest.raises(ValueError, match="You can not pass your own action."):
            processor.process_event("PLAYER1", {"event": ClientEvent.PASS})
            
        # Tests passing when forced to contest/reveal
        state.declared_assassinate = True
        with pytest.raises(ValueError, match="You must contest, block, or reveal."):
            processor.process_event("PLAYER2", {"event": ClientEvent.PASS})
            
        state.declared_assassinate = False
        processor.process_event("PLAYER2", {"event": ClientEvent.PASS})
        
        # Tests passing twice
        with pytest.raises(ValueError, match="You have already done this."):
            processor.process_event("PLAYER2", {"event": ClientEvent.PASS})
            
        # Tests passing successfully from all players
        processor.process_event("PLAYER3", {"event": ClientEvent.PASS})
        assert state.status["current_match_state"] == MatchEvent.ACTION_CONFIRMED

    def test_process_event_while_action_declared_blocking_and_challenging(self):
        state, processor = self._setup_processor(reformation=True)
        state.status["current_match_state"] = MatchEvent.ACTION_DECLARED
        state.turn_description["action"] = Action.STEAL
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER3"
        
        # Tests blocking your own action
        with pytest.raises(ValueError, match="You can not block your own action."):
            processor.process_event("PLAYER1", {"event": ClientEvent.BLOCK})
            
        # Tests blocking an unblockable action
        state.turn_description["action"] = Action.TAX
        with pytest.raises(ValueError, match="This action can not be blocked."):
            processor.process_event("PLAYER2", {"event": ClientEvent.BLOCK})
            
        # Tests blocking some action only the target can block
        state.turn_description["action"] = Action.STEAL
        with pytest.raises(ValueError, match="Only the target player can block this."):
            processor.process_event("PLAYER2", {"event": ClientEvent.BLOCK})
            
        # Tests blocking Reformation fellow member
        state.turn_description["action"] = Action.FOREIGN_AID
        state.turn_description["target_id"] = None
        with pytest.raises(ValueError, match="You can not block a foreign aid from a fellow party member."):
            processor.process_event("PLAYER2", {"event": ClientEvent.BLOCK}) # P1 and P2 are LOYALIST

        # Tests blocking invalid claim
        with pytest.raises(ValueError, match="You must claim one of"):
            processor.process_event("PLAYER3", {"event": ClientEvent.BLOCK, "claimed_card": "duke"})

        # Tests successful blocking 
        processor.process_event("PLAYER3", {"event": ClientEvent.BLOCK, "claimed_card": Card.DUKE})
        assert state.status["current_match_state"] == MatchEvent.BLOCK_DECLARED

        # Tests challenging your own action
        state.status["current_match_state"] = MatchEvent.ACTION_DECLARED
        with pytest.raises(ValueError, match="You can not challenge your own action."):
            processor.process_event("PLAYER1", {"event": ClientEvent.CHALLENGE})

        # Tests challenging some unchallengeable action
        state.turn_description["action"] = Action.INCOME
        with pytest.raises(ValueError, match="The current action can not be challenged."):
            processor.process_event("PLAYER2", {"event": ClientEvent.CHALLENGE})

        # Tests successful challenging
        state.turn_description["action"] = Action.TAX
        processor.process_event("PLAYER2", {"event": ClientEvent.CHALLENGE})
        assert state.status["current_match_state"] == MatchEvent.ACTION_CHALLENGE_CONFIRMED

    def test_process_event_while_block_declared(self):
        state, processor = self._setup_processor()
        state.status["current_match_state"] = MatchEvent.BLOCK_DECLARED
        state.turn_description["action"] = Action.FOREIGN_AID
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["blocker_id"] = "PLAYER2"

        # Tests invalid event
        with pytest.raises(ValueError, match="You can not do it right now."):
            processor.process_event("PLAYER3", {"event": ClientEvent.BLOCK})

        # Tests passing your own block
        with pytest.raises(ValueError, match="You can not pass your own block."):
            processor.process_event("PLAYER2", {"event": ClientEvent.PASS})

        # Tests passing twice
        processor.process_event("PLAYER1", {"event": ClientEvent.PASS})
        with pytest.raises(ValueError, match="You have already done this."):
            processor.process_event("PLAYER1", {"event": ClientEvent.PASS})

        # Tests successfully passing a block
        processor.process_event("PLAYER3", {"event": ClientEvent.PASS})
        assert state.status["current_match_state"] == MatchEvent.BLOCK_CONFIRMED

        # Tests challenging your own block
        state.status["current_match_state"] = MatchEvent.BLOCK_DECLARED
        with pytest.raises(ValueError, match="You can not challenge your own block."):
            processor.process_event("PLAYER2", {"event": ClientEvent.CHALLENGE})

        # Tests successfully challenging
        processor.process_event("PLAYER3", {"event": ClientEvent.CHALLENGE})
        assert state.status["current_match_state"] == MatchEvent.BLOCK_CHALLENGE_CONFIRMED

    def test_process_event_while_card_loss(self):
        state, processor = self._setup_processor()
        state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
        state.turn_description["action"] = Action.ASSASSINATE
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        state.turn_description["card_loss_player_id"] = "PLAYER2"

        # Tests with the wrong player
        with pytest.raises(ValueError, match="It is not your turn."):
            processor.process_event("PLAYER1", {"event": ClientEvent.SELECTED_CARD})
            
        # Tests with the wrong event
        with pytest.raises(ValueError, match="You must choose one card to lose."):
            processor.process_event("PLAYER2", {"event": ClientEvent.PASS})
            
        # Tests unowned card
        with pytest.raises(ValueError, match="You need to select cards that you own."):
            processor.process_event("PLAYER2", {"event": ClientEvent.SELECTED_CARD, "selected_card": Card.CONTESSA})

        # Tests successfully and proceeds the action
        state.turn_description["pending_resolution"] = "action_proceeds"
        res = processor.process_event("PLAYER2", {"event": ClientEvent.SELECTED_CARD, "selected_card": Card.DUKE})
        assert state.status["current_match_state"] == MatchEvent.ACTION_CONFIRMED
        assert res["event"] == MatchEvent.ACTION_CONFIRMED

        # Tests successfully and cancle the action
        state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
        state.players["PLAYER2"].cards = [Card.DUKE] 
        state.turn_description["pending_resolution"] = "action_cancelled"
        res = processor.process_event("PLAYER2", {"event": ClientEvent.SELECTED_CARD, "selected_card": Card.DUKE})
        assert state.status["current_match_state"] == MatchEvent.TURN_RESOLVED
        assert res["action_cancelled"] is True

        # Tests successfully a normal action (assassine or coup)
        state.status["current_match_state"] = MatchEvent.WAITING_CARD_LOSS
        state.players["PLAYER2"].cards = [Card.DUKE]
        state.turn_description["pending_resolution"] = None
        processor.process_event("PLAYER2", {"event": ClientEvent.SELECTED_CARD, "selected_card": Card.DUKE})
        assert state.status["current_match_state"] == MatchEvent.TURN_RESOLVED

    def test_process_event_while_waiting_exchange(self) -> None:
        state, processor = self._setup_processor()
        state.status["current_match_state"] = MatchEvent.WAITING_EXCHANGE
        state.turn_description["action"] = Action.EXCHANGE
        state.turn_description["exchange_player_id"] = "PLAYER1"
        state.turn_description["exchange_return_count"] = 2
        state.players["PLAYER1"].cards = [Card.DUKE, Card.ASSASSIN, Card.CAPTAIN, Card.CONTESSA]

        # Tests wrong player
        with pytest.raises(ValueError, match="It is not your turn."):
            processor.process_event("PLAYER2", {"event": ClientEvent.SELECTED_CARDS})
            
        # Tests wrong event or count
        with pytest.raises(ValueError, match="You must choose 2 cards to return."):
            processor.process_event("PLAYER1", {"event": ClientEvent.PASS})
        with pytest.raises(ValueError, match="You must choose 2 cards to return."):
            processor.process_event("PLAYER1", {"event": ClientEvent.SELECTED_CARDS, "selected_cards": [Card.DUKE]})

        # Tests unowned cards
        with pytest.raises(ValueError, match="You need to select cards that you own."):
            processor.process_event("PLAYER1", {"event": ClientEvent.SELECTED_CARDS, "selected_cards": [Card.AMBASSADOR, Card.AMBASSADOR]})

        # Tests successfully exchanging
        processor.process_event("PLAYER1", {"event": ClientEvent.SELECTED_CARDS, "selected_cards": [Card.DUKE, Card.CAPTAIN]})
        assert state.status["current_match_state"] == MatchEvent.TURN_RESOLVED
        assert len(state.players["PLAYER1"].cards) == 2

    def test_process_event_while_examine(self):
        state, processor = self._setup_processor()
        state.status["current_match_state"] = MatchEvent.WAITING_EXAMINE_CARD_SELECTION
        state.turn_description["action"] = Action.EXAMINE
        state.turn_description["source_id"] = "PLAYER1"
        state.turn_description["target_id"] = "PLAYER2"
        # Tests when some other player selects some card
        with pytest.raises(ValueError, match="It is not your turn."):
            processor.process_event("PLAYER1", {"selected_card": Card.DUKE})
        # Tests choosing unowned card
        with pytest.raises(ValueError, match="You need to select a card that you own."):
            processor.process_event("PLAYER2", {"selected_card": Card.CAPTAIN}) 
        # Tests successfully selecting the card
        res = processor.process_event("PLAYER2", {"selected_card": Card.DUKE})
        assert res["event"] == MatchEvent.WAITING_EXAMINE_DECISION
        assert state.turn_description["declared_card"] == Card.DUKE
        assert state.status["current_match_state"] == MatchEvent.WAITING_EXAMINE_DECISION

        # Tests when some other player tries to force_exchange
        with pytest.raises(ValueError, match="It is not your turn."):
            processor.process_event("PLAYER2", {"force_exchange": True})
        # Tests successfully forcing exchange
        res = processor.process_event("PLAYER1", {"force_exchange": True})
        assert res["event"] == MatchEvent.TURN_RESOLVED
        assert res["force_exchange"] is True
        assert state.status["current_match_state"] == MatchEvent.TURN_RESOLVED