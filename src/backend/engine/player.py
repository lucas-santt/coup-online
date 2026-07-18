class Player:
    def __init__(self, id: str, name: str, starting_coins):
        self.id = id
        self.name = name
        self.coins = starting_coins
        self.alive = True
        self.cards = []

    # Returns a player's possible options given their number of coins
    def get_action_options(self):
        coins = self.coins
        if coins >= 10:
            return ["coup"]
        elif coins >= 7:
            return ["income", "foreign_aid", "coup", "tax", "assassinate", "steal", "exchange"]
        elif coins >= 3:
            return ["income", "foreign_aid", "tax", "assassinate", "steal", "exchange"]
        else:
            return ["income", "foreign_aid", "tax", "steal", "exchange"]
        
    def __repr__(self):
        return f"ID: {self.id} | Name: {self.name} | Coins: {self.coins} \n| Alive: {self.alive} | Cards: {self.cards}"