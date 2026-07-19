class Player:
    def __init__(self, id: str, name: str, starting_coins):
        self.id = id
        self.name = name
        self.coins = starting_coins
        self.alive = True
        self.cards = []

    def __repr__(self):
        return f"ID: {self.id} | Name: {self.name} | Coins: {self.coins} \n| Alive: {self.alive} | Cards: {self.cards}"