import pytest
from backend.engine.player import Player

def test_init():
    # Tests player1 initialization
    player1 = Player("PLAYER_1", "João", 2)
    assert(repr(player1) == "ID: PLAYER_1 | Name: João | Coins: 2 \n| Alive: True | Cards: []")

def test_get_action_options():
    # Tests the get option method
    player1 = Player("PLAYER_1", "João", 10)
    assert(player1.get_action_options() == ["coup"])
    player1.coins = 9
    assert(player1.get_action_options() == ["income", "foreign_aid", "coup", "tax", "assassinate", "steal", "exchange"])
    player1.coins = 5
    assert(player1.get_action_options() == ["income", "foreign_aid", "tax", "assassinate", "steal", "exchange"])
    player1.coins = 1
    assert(player1.get_action_options() == ["income", "foreign_aid", "tax", "steal", "exchange"])