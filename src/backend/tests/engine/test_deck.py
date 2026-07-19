import pytest
from backend.engine.deck import Deck

def test_init():
    # Tests finite deck initialization 
    finite_deck = Deck(3, ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"])
    assert(repr(finite_deck) == "Deck: ['Ambassador', 'Assassin', 'Captain', 'Contessa', 'Duke', 'Ambassador', 'Assassin', 'Captain', 'Contessa', 'Duke', 'Ambassador', 'Assassin', 'Captain', 'Contessa', 'Duke']")

    # Tests infinite deck initialization
    infinite_deck = Deck(0, ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"])
    assert(repr(infinite_deck) == "Deck: ['Ambassador', 'Assassin', 'Captain', 'Contessa', 'Duke']")

def test_pop_card():
    # Tests the order of removals
    base_cards = ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]
    deck = Deck(1, base_cards)
    for i in range(5):
        card = deck.pop_card()
        assert(card == base_cards[4-i])
    
    # Tests a removal with empty deck
    with pytest.raises(ValueError, match="The deck is empty."):
        deck.pop_card()

def test_shuffle_and_push_card():
    # Tests shuffle
    deck = Deck(1, ["Ambassador"])
    deck.shuffle()
    assert(repr(deck) == "Deck: ['Ambassador']")

    # Tests pushing a card
    deck.push_card("Assassin")
    assert(repr(deck) == "Deck: ['Ambassador', 'Assassin']")