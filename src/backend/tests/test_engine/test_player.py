import pytest
from backend.engine.player import Player

def test_init():
    # Tests player1 initialization
    player1 = Player("PLAYER_1", "João", 2)
    assert(repr(player1) == "ID: PLAYER_1 | Name: João | Coins: 2 \n| Alive: True | Cards: []")