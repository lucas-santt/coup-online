import pytest
from src.backend.engine.match import Match

def test_init():
    # Tests init match
    match = Match("ABCXYZ")
    assert(len(match.players.values()) == 0 and not match.status["started"])

def test_add_and_remove_players():
    match = Match("ABCXYZ")
    
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
    match = Match("ABCXYZ")
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
    match = Match("ABCXYZ")
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
    match = Match("ABCXYZ")
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
    match = Match("ABCXYZ")
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