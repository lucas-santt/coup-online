import pytest
from backend.engine.player import Player

def test_init():
    # Tests player1 initialization
    player1 = Player("ABCXYZ", "João", 2)
    assert(repr(player1) == "ID: ABCXYZ | Name: João | Coins: 2 \n| Alive: True | Cards: []")