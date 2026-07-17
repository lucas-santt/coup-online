import random

class Deck:
    def __init__(self, copies_by_card: int, base_cards: list[str]):
        self.copies_by_card = copies_by_card
        self.base_cards = base_cards
        self.deck = []
        # If copies_by_card <= 0, then the deck has infinite copies of each influence
        if copies_by_card > 0:
            self.deck = self.copies_by_card * self.base_cards
    
    # Shuffles the deck of cards
    def shuffle(self):
        if self.copies_by_card > 0:
            random.shuffle(self.deck)
    
    # Select a card from the deck
    def pop_card(self):
        if self.copies_by_card <= 0:
            return random.choice(self.base_cards)
        elif len(self.deck) < 1:
            raise ValueError("The deck is empty.")
        else: 
            return self.deck.pop()
    
    # Returns a card to the deck
    def push_card(self, card: str):
        if self.copies_by_card > 0:
            self.deck.append(card)

    def __repr__(self):
        if self.copies_by_card > 0:
            return f"Deck: {self.deck}"
        else:
            return f"Deck: {self.base_cards}"