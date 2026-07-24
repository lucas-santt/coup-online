class Player:
    def __init__(self, id: str, name: str, starting_coins):
        self.id = id
        self.name = name
        self.coins = starting_coins
        self.alive = True
        self.cards = []