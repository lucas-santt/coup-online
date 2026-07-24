import random

from backend.engine.enums import Card


class Deck:
	def __init__(self, character_copies: int, base_cards: list[Card]) -> None:
		self.character_copies = character_copies
		self.base_cards = base_cards
		# <= 0 copies means "infinite copies of each card" (see pop_card
		# below) -- there's no finite list to build, so `deck` just stays
		# empty and is never touched by shuffle/pop/push.
		self.deck: list[Card] = self.character_copies * self.base_cards if character_copies > 0 else []

	def shuffle(self) -> None:
		if self.character_copies > 0:
			random.shuffle(self.deck)

	def pop_card(self) -> Card:
		if self.character_copies <= 0:
			return random.choice(self.base_cards)
		if len(self.deck) < 1:
			raise ValueError("The deck is empty.")
		return self.deck.pop()

	def push_card(self, card: Card) -> None:
		if self.character_copies > 0:
			self.deck.append(card)

	def __repr__(self) -> str:
		if self.character_copies > 0:
			return f"Deck: {self.deck}"
		return f"Deck: {self.base_cards}"