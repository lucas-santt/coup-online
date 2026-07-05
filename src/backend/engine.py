import random

class Player:
    def __init__(self, id: str, name: str, starting_coins):
        self.id = id
        self.name = name
        self.coins = starting_coins
        self.alive = True
        self.cards = []

class Deck:
    def __init__(self, copies_by_card: int, base_cards: list[str]):
        self.copies_by_card = copies_by_card
        self.base_cards = base_cards
        self.deck = []
        # If copies_by_card < 0, then the deck has infinite copies of each influence
        if copies_by_card > 0:
            self.deck = self.copies_by_card * self.base_cards
    
    def shuffle(self):
        if self.copies_by_card > 0:
            random.shuffle(self.deck)
    
    def pop_deck(self):
        if self.copies_by_card <= 0:
            return random.choice(self.base_cards)
        elif len(self.deck) < 1:
            raise ValueError("The deck is empty.")
        else: 
            return self.deck.pop()

    def __repr__(self):
        if self.copies_by_card > 0:
            return f"Deck: {self.deck}"
        else:
            return f"Deck: {self.base_cards}"

class Match:
    def __init__(self, id: str, base_cards=["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]):
        self.id = id
        self.players = {}
        self.status = {"started": False, # status of the match
                       "finished": False}
        self.order = [] # player order
        self.id_turn = 0 # indicates whose turn it is to play (order[id_turn])
        self.base_cards = base_cards

    def add_player(self, id: str, name: str):
        if self.status["started"]:
            raise ValueError("The match is not accepting new players.")
        elif len(self.order) == 10:
            raise ValueError("The match is already full.")
        else:
            new_player = Player(id, name, 0)
            self.players[id] = new_player
            self.order.append(id)
    
    def remove_player(self, id: str):
        self.players.pop(id)
        self.order.remove(id)
    
    def start_match(self, copies_by_card=None, starting_coins=2):
        num_players = len(self.order)
        if num_players < 2:
            raise ValueError("At least 2 players are required.")
        # If copies_by_card=None, choose default values
        if copies_by_card is not None:
            if copies_by_card > 0 and num_players > 2 * copies_by_card:
                raise ValueError("The size of the deck is insufficient for the number of players.")
            else:
                self.copies_by_card = copies_by_card
        # Default values
        elif num_players <= 6:
            self.copies_by_card = 3
        elif num_players <= 8:
            self.copies_by_card = 4
        else:   
            self.copies_by_card = 5
        self.starting_coins = starting_coins
        self.deck = Deck(self.copies_by_card, self.base_cards) # creates deck
        random.shuffle(self.order)
        self.deck.shuffle()
        self.deal_cards()
        self.give_coins(starting_coins)
        self.status["started"] = True
            
    def deal_cards(self):
        # Deals two initial cards to the players
        for id_player in self.order:
            for _ in range(2):
                card = self.deck.pop_deck()
                self.players[id_player].cards.append(card) 

    def give_coins(self, coins):
        for id_player in self.order:
            self.players[id_player].coins = coins

    def next_player(self):
        # Check which of the living players is next to play
        num_players = len(self.order)
        for _ in range(num_players):
            self.id_turn = (self.id_turn + 1) % num_players
            if self.players[self.order[self.id_turn]].alive:
                return self.id_turn
        # If everyone is dead
        self.status["finished"] = True
        raise ValueError("There are no living players in the match.")