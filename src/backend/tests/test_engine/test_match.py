import pytest
from backend.engine.match import Match

def test_init():
    # Tests init match
    match = Match("MATCH_0350")
    assert(len(match.players.values()) == 0 and not match.status["started"])

def test_add_and_remove_players():
    match = Match("MATCH_0350")
    
    # Tests adding a player while the game has not started
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    assert("PLAYER1" in match.players and "PLAYER2" in match.players and "PLAYER1" in match.order and "PLAYER2" in match.order)

    # Tests adding a player while the game is already full
    for i in range(8):
        match.add_player(f"PLAYER{i+3}", f"NAME{i+3}")
    with pytest.raises(ValueError, match="The match is already full."):
        match.add_player("PLAYER11", "NAME11")

    # Tests removing a player
    match.remove_player("PLAYER1")
    assert("PLAYER1" not in match.players and "PLAYER1" not in match.order)

def test_start():
    # Tests starting a match with one player
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    with pytest.raises(ValueError, match="At least 2 players are required."):
        match.start_match()
    
    # Tests starting a match with default copies_by_card initialization
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    assert(match.copies_by_card == 3 and match.status["started"] and match.status["current_match_state"] == "waiting_action")
    assert(match.players["PLAYER1"].coins == 2 and len(match.players["PLAYER1"].cards) == 2)

    # Tests adding a player while the match had already started
    with pytest.raises(ValueError, match="The match is not accepting new players."):
        match.add_player("PLAYER3", "Antônio")

def test_check_winner_and_check_elimination():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match(copies_by_card=5) 
    # Tests check_winner() while there is no winner
    assert(match.check_winner() == None)
    # Tests check_elimination while there is an elimination
    match.players["PLAYER2"].cards = []
    match.check_elimination()
    assert(match.players["PLAYER1"].alive and not match.players["PLAYER2"].alive)
    # Tests check_winner() while there is a winner
    assert(match.check_winner().id == "PLAYER1")
    # Tests check_winner() while there is no player alive
    match.players["PLAYER1"].cards = []
    match.check_elimination()
    with pytest.raises(ValueError, match="There are no living players in the game."):
        match.check_winner()

def test_new_turn():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match(copies_by_card=0) 
    # Tests new_turn while there is players alive
    current_player_id = match.order[match.turn_id]
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    assert(match.new_turn()["player"] == other_player_id)
    # Tests new_turn while there is only one player alive (winner)
    match.players["PLAYER2"].cards = []
    assert(match.new_turn()["winner"].id == "PLAYER1")
    # Tests new_turn while there is no player alive
    match.players["PLAYER1"].cards = []
    with pytest.raises(ValueError, match="There are no living players in the game."):
        match.new_turn()

def test_process_event():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match() 
    current_player_id = match.order[match.turn_id]
    wrong_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests playing on the wrong turn
    with pytest.raises(ValueError, match="It is not your turn."):
        match.process_event(wrong_player_id, {"event": "chosen_action", "action": "income"})

    # Tests playing on the wright turn
    data_action = {"event": "chosen_action", "action": "income"}
    result = match.process_event(current_player_id, data_action)
    assert(result["event"] == "action_confirmed")
    assert(match.status["current_match_state"] == "action_confirmed")

def test_process_event_while_waiting_action():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    wrong_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    
    # Tests stealing from yourself
    with pytest.raises(ValueError, match="You can not do it with this player."):
        match.process_event(current_player_id, {"event": "chosen_action", "action": "steal", "target_id": current_player_id})
    
    # Tests stealing from a player with no money
    with pytest.raises(ValueError, match="You can not steal from a player with no coins."):
        match.add_coins_to_player(wrong_player_id, -2)
        match.process_event(current_player_id, {"event": "chosen_action", "action": "steal", "target_id": wrong_player_id})
    
    # Tests making some action that the player can not do (not enough money)
    with pytest.raises(ValueError, match="This is not a valid option or you do not have enough money."):
        match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": wrong_player_id})
    
    # Tests assassinate with enough coins
    match.add_coins_to_player(current_player_id, 7)
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": wrong_player_id})
    assert(match.status["current_match_state"] == "action_declared")

def test_process_event_while_action_declared():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    wrong_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2" 
    match.add_coins_to_player(current_player_id, 7)
    match.process_event(current_player_id, {"event": "chosen_action", "action": "tax", "target_id": wrong_player_id})
    # Tests making some strange event
    with pytest.raises(ValueError, match="You can not do it right now."):
        match.process_event(current_player_id, {"event": "chosen_action", "action": "income"})
    # Tests passing your own action
    with pytest.raises(ValueError, match="You can not pass your own action."):
        match.process_event(current_player_id, {"event": "pass"})
    # Tests block an action that can not be blocked
    with pytest.raises(ValueError, match="This action can not be blocked."):
        match.process_event(wrong_player_id, {"event": "block"})
    # Tests passing the action successfully
    match.process_event(wrong_player_id, {"event": "pass"})
    assert(match.status["current_match_state"] == "action_confirmed")
    match.end_current_turn()
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": wrong_player_id})
    # Tests blocking your own action
    with pytest.raises(ValueError, match="You can not block your own action."):
        match.process_event(current_player_id, {"event": "block"})
    # Tests blocking the action successfully
    match.process_event(wrong_player_id, {"event": "block"})
    assert(match.status["current_match_state"] == "block_declared")
    match.end_current_turn()
    match.process_event(current_player_id, {"event": "chosen_action", "action": "foreign_aid"})
    # Tests challenging your own action
    with pytest.raises(ValueError, match="You can not challenge your own action."):
        match.process_event(current_player_id, {"event": "challenge"})
    # Tests challenging an action that can not be challenged
    with pytest.raises(ValueError, match="The current action can not be challenged."):
        match.process_event(wrong_player_id, {"event": "challenge"})
    match.end_current_turn()
    # Tests challenging the action successfully
    match.process_event(current_player_id, {"event": "chosen_action", "action": "tax"})
    match.process_event(wrong_player_id, {"event": "challenge"})
    # Tests the same player passing two times
    match2 = Match("MATCH_2350")
    match2.add_player("PLAYER1", "João")
    match2.add_player("PLAYER2", "Maria")
    match2.add_player("PLAYER3", "Paulo")
    match2.start_match()
    current_player_id = match2.order[match2.turn_id]
    match2.add_coins_to_player(current_player_id, 2)
    other_player_id1 = "PLAYER1" if current_player_id != "PLAYER1" else "PLAYER2"
    other_player_id2 = "PLAYER3" if current_player_id != "PLAYER3" else "PLAYER2"
    match2.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": other_player_id1})
    match2.process_event(other_player_id1, {"event": "pass"})
    with pytest.raises(ValueError, match="You have already done this."):
            match2.process_event(other_player_id1, {"event": "pass"})
    # Tests some player (not the target) blocking assassinate
    with pytest.raises(ValueError, match="Only the target player can block this."):
                match2.process_event(other_player_id2, {"event": "block"})
        
def test_process_event_while_block_declared():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.add_player("PLAYER3", "Paulo")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    match.add_coins_to_player(current_player_id, 2)
    other_player_id1 = "PLAYER1" if current_player_id != "PLAYER1" else "PLAYER2"
    other_player_id2 = "PLAYER3" if current_player_id != "PLAYER3" else "PLAYER2"
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": other_player_id1})
    match.process_event(other_player_id1, {"event": "block"})
    # Tests making some other action or blocking a block
    with pytest.raises(ValueError, match="You can not do it right now."):
        match.process_event(other_player_id2, {"event": "chosen_action", "action": "income"})
    with pytest.raises(ValueError, match="You can not do it right now."):
        match.process_event(current_player_id, {"event": "block"})
    # Tests passing yout own block or challenging you own block
    with pytest.raises(ValueError, match="You can not pass your own block."):
        match.process_event(other_player_id1, {"event": "pass"})
    with pytest.raises(ValueError, match="You can not challenge your own block."):
        match.process_event(other_player_id1, {"event": "challenge"})
    # Tests passing twice
    match.process_event(current_player_id, {"event": "pass"})
    with pytest.raises(ValueError, match="You have already done this."):
            match.process_event(current_player_id, {"event": "pass"})
    # Tests passing the block successfully
    match.process_event(other_player_id2, {"event": "pass"})
    assert(match.status["current_match_state"] == "block_confirmed")
    # Tests challenging a block successfully
    match.new_turn()
    current_player_id = match.order[match.turn_id]
    match.add_coins_to_player(current_player_id, 2)
    other_player_id1 = "PLAYER1" if current_player_id != "PLAYER1" else "PLAYER2"
    other_player_id2 = "PLAYER3" if current_player_id != "PLAYER3" else "PLAYER2"
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": other_player_id1})
    match.process_event(other_player_id1, {"event": "block"})
    match.process_event(current_player_id, {"event": "challenge"})
    assert(match.status["current_match_state"] == "block_challenge_confirmed")

def test_process_event_while_card_loss():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.add_player("PLAYER3", "Paulo")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    match.add_coins_to_player(current_player_id, 2)
    other_player_id1 = "PLAYER1" if current_player_id != "PLAYER1" else "PLAYER2"
    other_player_id2 = "PLAYER3" if current_player_id != "PLAYER3" else "PLAYER2"
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": other_player_id1})
    match.process_event(other_player_id1, {"event": "pass"})
    match.process_event(other_player_id2, {"event": "pass"})
    match.make_action()
    # Tests some action from other player and making other action from the target
    with pytest.raises(ValueError, match="It is not your turn."):
        match.process_event(current_player_id, {"event": "pass"})
    with pytest.raises(ValueError, match="You must choose one card to lose."):
        match.process_event(other_player_id1, {"event": "pass"})
    # Tests selecting cards that the target do not have
    cards = match.players[other_player_id1].cards
    deck = ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]
    for card in cards:
        if card in deck:
            deck.remove(card)
    with pytest.raises(ValueError, match="You need to select cards that you own."):
        match.process_event(other_player_id1, {"event": "selected_card", "selected_card": deck[0]})
    # Tests some successfully event
    match.process_event(other_player_id1, {"event": "selected_card", "selected_card": cards[0]})
    assert(len(match.players[other_player_id1].cards) == 1 and match.status["current_match_state"] == "turn_resolved")

def test_process_event_while_waiting_exchange():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    match.add_coins_to_player(current_player_id, 2)
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    match.process_event(current_player_id, {"event": "chosen_action", "action": "exchange"})
    match.process_event(other_player_id, {"event": "pass"})
    match.make_action()
    assert(match.status["current_match_state"] == "waiting_exchange")
    # Tests some action from other player and making other action from the target
    with pytest.raises(ValueError, match="It is not your turn."):
        match.process_event(other_player_id, {"event": "pass"})
    with pytest.raises(ValueError, match="You must choose two cards to return to the deck."):
        match.process_event(current_player_id, {"event": "pass"})
    # Tests selecting cards that the target do not have
    cards = match.players[current_player_id].cards
    assert(len(cards) == 4)
    deck = ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]
    for card in cards:
        if card in deck:
            deck.remove(card)
    with pytest.raises(ValueError, match="You need to select cards that you own."):
        match.process_event(current_player_id, {"event": "selected_cards", "selected_cards": [deck[0], deck[0]]})
    # Tests some successfully event
    match.process_event(current_player_id, {"event": "selected_cards", "selected_cards": [cards[0], cards[1]]})
    assert(len(match.players[current_player_id].cards) == 2 and match.status["current_match_state"] == "turn_resolved")

def test_make_action_income():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests making income
    match.process_event(current_player_id, {"event": "chosen_action", "action": "income"})
    assert(match.status["current_match_state"] == "action_confirmed")
    match.make_action()
    assert(match.players[current_player_id].coins == 3 and match.status["current_match_state"] == "turn_resolved")

def test_make_action_foreign_aid():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests making foreign aid
    match.process_event(current_player_id, {"event": "chosen_action", "action": "foreign_aid"})
    assert(match.status["current_match_state"] == "action_declared")
    match.process_event(other_player_id, {"event": "pass"})
    assert(match.status["current_match_state"] == "action_confirmed")
    match.make_action()
    assert(match.players[current_player_id].coins == 4 and match.status["current_match_state"] == "turn_resolved")

def test_make_action_coup():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests making coup when the target has two cards
    match.add_coins_to_player(current_player_id, 14)
    match.process_event(current_player_id, {"event": "chosen_action", "action": "coup", "target_id": other_player_id})
    assert(match.players[current_player_id].coins == 9 and match.status["current_match_state"] == "action_confirmed")
    match.make_action()
    assert(match.status["current_match_state"] == "waiting_card_loss" and match.turn_description["target_id"] == other_player_id)
    # Tests making assassinate when the target has one card
    match.players[other_player_id].cards = ["duke"]
    match.end_current_turn()
    match.process_event(current_player_id, {"event": "chosen_action", "action": "coup", "target_id": other_player_id})
    match.make_action()
    assert(len(match.players[other_player_id].cards) == 0 and match.status["current_match_state"] == "turn_resolved")
    
def test_make_action_tax():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests making tax
    match.process_event(current_player_id, {"event": "chosen_action", "action": "tax"})
    assert(match.status["current_match_state"] == "action_declared")
    match.process_event(other_player_id, {"event": "pass"})
    assert(match.status["current_match_state"] == "action_confirmed")
    match.make_action()
    assert(match.players[current_player_id].coins == 5 and match.status["current_match_state"] == "turn_resolved")

def test_make_action_assassinate():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    match.add_coins_to_player(current_player_id, 6)
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests assassinating when the target has two cards
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": other_player_id})
    assert(match.status["current_match_state"] == "action_declared")
    match.process_event(other_player_id, {"event": "pass"})
    assert(match.status["current_match_state"] == "action_confirmed")
    match.make_action()
    assert(match.status["current_match_state"] == "waiting_card_loss")
    # Tests assassinating when the target has one card
    match.players[other_player_id].cards = ["duke"]
    match.end_current_turn()
    match.process_event(current_player_id, {"event": "chosen_action", "action": "assassinate", "target_id": other_player_id})
    match.process_event(other_player_id, {"event": "pass"})
    match.make_action()
    assert(len(match.players[other_player_id].cards) == 0 and match.status["current_match_state"] == "turn_resolved")

def test_make_action_steal():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    match.add_coins_to_player(other_player_id, 1)
    # Tests stealing when the target has two coins
    match.process_event(current_player_id, {"event": "chosen_action", "action": "steal", "target_id": other_player_id})
    assert(match.status["current_match_state"] == "action_declared")
    match.process_event(other_player_id, {"event": "pass"})
    assert(match.status["current_match_state"] == "action_confirmed")
    match.make_action()
    assert(match.players[other_player_id].coins == 1 and match.status["current_match_state"] == "turn_resolved")
    # Tests stealing when the target has one coin
    match.end_current_turn()
    match.process_event(current_player_id, {"event": "chosen_action", "action": "steal", "target_id": other_player_id})
    match.process_event(other_player_id, {"event": "pass"})
    match.make_action()
    assert(match.players[current_player_id].coins == 5 and match.players[other_player_id].coins == 0 and match.status["current_match_state"] == "turn_resolved")

def test_make_action_exchange():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    current_player_id = match.order[match.turn_id]
    match.add_coins_to_player(current_player_id, 6)
    other_player_id = "PLAYER1" if current_player_id == "PLAYER2" else "PLAYER2"
    # Tests exchanging
    match.process_event(current_player_id, {"event": "chosen_action", "action": "exchange"})
    match.process_event(other_player_id, {"event": "pass"})
    match.make_action()
    assert(len(match.players[current_player_id].cards) == 4 and match.status["current_match_state"] == "waiting_exchange")

def test_steal_coins():
    match = Match("MATCH_0350")
    match.add_player("PLAYER1", "João")
    match.add_player("PLAYER2", "Maria")
    match.start_match()
    # Tests stealing coins when the target does not have enough coins
    with pytest.raises(ValueError, match="The target player does not have enough coins."):
        match.steal_coins("PLAYER1", "PLAYER2", 3)