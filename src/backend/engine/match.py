import random
from src.backend.engine.player import Player
from src.backend.engine.deck import Deck

class Match:
    def __init__(self, id: str, base_cards=["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]):
        self.id = id
        self.players = {}
        self.status = {"started": False, # status of the match
                       "finished": False,
                       "current_match_state": None}
        # Possible values of current_match_state:
        # "waiting_action": wait for the player on the turn to choose an action;
        # "action_declared": the player on the turn declared their action, but it is subject to challenges or blocks;
        # "block_declared": a player blocked the current action, but it is open to challenge;
        # "action_confirmed": all the other players accepted the action, which will be executed immediately;
        # "block_confirmed": all the other players accepted the block. The current action will be canceled;
        # "challenge_confirmed": a challenge has been initiated and will be resolved immediately;
        # "waiting_card_loss": a player with more than one card has lost influence and must choose one of their cards;
        # "waiting_exchange": a player used the "exchange" action and must return two cards to the deck.
        
        self.order = [] # player order
        self.turn_id = 0 # indicates whose turn it is to play (order[turn_id])
        self.base_cards = base_cards
        self.action_description = {"source_id": None, # informations about the last action
                                   "target_id": None,
                                   "action": None,
                                   "blocker_id": None,
                                   "challenger_id": None,
                                   "num_pass_action": 0, # number of players who accepted the last action (did not block or challenge)
                                   "num_pass_block": 0}

    # Adds a player to the match
    def add_player(self, id: str, name: str):
        if self.status["started"]:
            raise ValueError("The match is not accepting new players.")
        elif len(self.order) >= 10:
            raise ValueError("The match is already full.")
        else:
            new_player = Player(id, name, 0)
            self.players[id] = new_player
            self.order.append(id)
    
    # Removes a player from the match
    def remove_player(self, id: str):
        if id in self.players:
            self.players.pop(id)
        if id in self.order:
            self.order.remove(id)
    
    # Adjusts match states and distributes resources (cards and coins) to the players
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
        self.status["current_match_state"] = "waiting_action"
        first_player = self.players[self.order[0]] # first player
        return{"event": "new_turn",
               "player": first_player.id,
               "options": first_player.get_action_options(),
               "last_eliminated": []}
    
    # Deal the cards to each player
    def deal_cards(self):
        # Deals two initial cards to the players
        for player_id in self.order:
            for _ in range(2):
                card = self.deck.pop_card()
                self.players[player_id].cards.append(card) 

    # Distribute an equal number of coins to each player
    def give_coins(self, coins):
        for player_id in self.order:
            self.players[player_id].coins = coins

    # Returns the next player to play
    def next_player(self):
        # Check which of the living players is next to play
        num_players = len(self.order)
        for _ in range(num_players):
            self.turn_id = (self.turn_id + 1) % num_players
            player = self.players[self.order[self.turn_id]]
            if player.alive:
                return player
        # If everyone is dead
        raise ValueError("There are no living players in the match.")
    
    # Eliminates players with no cards
    def check_elimination(self):
        eliminated = []
        for player_id in self.order:
            player = self.players[player_id]
            if player.alive and len(player.cards) == 0:
                player.alive = False
                eliminated.append(player_id)
        return eliminated

    # Checks how many players are alive in the match. If there is only 1 (the winner), it returns that player
    def check_winner(self):
        players_alive = [player for player in self.players.values() if player.alive]
        if len(players_alive) == 0:
            raise ValueError("There are no living players in the game.")
        if len(players_alive) == 1:
            return players_alive[0]
        else:
            return None
    
    # Checks for eliminations, checks if there is a winner, and otherwise returns the next player to play
    def new_turn(self):
        self.end_current_turn()
        last_eliminated = self.check_elimination()
        winner_id = self.check_winner()
        if winner_id is not None:
            self.status["finished"] = True
            self.status["current_match_state"] = "end_of_match"
            return{"event": "end_of_match",
                   "winner": winner_id,
                   "last_eliminated": last_eliminated}
        else:
            player = self.next_player()
            options = player.get_action_options()
            return{"event": "new_turn",
                   "player": player.id,
                   "options": options,
                   "last_eliminated": last_eliminated}
    
    # Processes events related to player actions and challenges
    def process_event(self, player_id: str, data: dict):
        current_state_match = self.status["current_match_state"]
        
        # If the player_id is already dead
        if not self.players[player_id].alive:
            raise ValueError("You can not make anything while you are dead.")

        # If the match is waiting for some action from a player
        elif current_state_match == "waiting_action":
            return self.process_event_while_waiting_action(player_id, data)
           
        # If an action has already been declared and has not been blocked
        elif current_state_match == "action_declared":
            return self.process_event_while_action_declared(player_id, data)
                
        # If an action has already been declared and has already been blocked
        elif current_state_match == "block_declared":   
            return self.process_event_while_block_declared(player_id, data)
        
        # If some player must lose a card (challenge, coup or assassinate)
        elif current_state_match == "waiting_card_loss":
            return self.process_event_while_card_loss(player_id, data)

        # If some player must give two cards back to the deck (exchange)
        elif current_state_match == "waiting_exchange":
            return self.process_event_while_waiting_exchange(player_id, data)
    
    # Processes the action while the state is "waiting_action"
    def process_event_while_waiting_action(self, player_id: str, data: dict):
        event = data.get("event")
        action = data.get("action")
        target_id = data.get("target_id")

        # Catch errors
        if event != "chosen_action":
            raise ValueError("You can not do it right now.")
        if player_id != self.order[self.turn_id]:
            raise ValueError("It is not your turn.")
        if action not in self.players[player_id].get_action_options():
            raise ValueError("This is not a valid option or you do not have enough money.")
        if action in ["coup", "assassinate", "steal"]:
            # If the target is not on game, if target is dead or the source and the target are the same
            if target_id not in self.order or player_id == target_id or not self.players[target_id].alive:
                raise ValueError("You can not do it with this player.")
            if action == "steal" and self.players[target_id].coins == 0:
                raise ValueError("You can not steal from a player with no coins.")
        
        # Gets action description
        self.action_description = {"source_id": player_id,
                                   "target_id": target_id,
                                   "action": action,
                                   "blocker_id": None,
                                   "challenger_id": None,
                                   "num_pass_action": 0,
                                   "num_pass_block": 0}
        
        # If the action can not be blocked or challenged
        if action in ["income", "coup"]:
            self.status["current_match_state"] = "action_confirmed"
        else:
            # The match will wait for each player to confirm or not the action
            self.status["current_match_state"] = "action_declared"
            self.action_description["num_pass_action"] = 0
        return {"event": self.status["current_match_state"],
                "action": action,
                "player_id": player_id,
                "target_id": target_id}

    # Processes the action while the state is "action_declared"
    def process_event_while_action_declared(self, player_id: str, data: dict):
        event = data.get("event")
        action = self.action_description["action"]
        source_id = self.action_description["source_id"]
        target_id = self.action_description["target_id"]

        if event not in ["pass", "block", "challenge"]:
            raise ValueError("You can not do it right now.")
        
        elif event == "pass":
            # Catch errors
            if player_id == source_id:
                raise ValueError("You can not pass your own action.")
            
            self.action_description["num_pass_action"] += 1
            players_alive = [p for p in self.players.values() if p.alive]
            
            # if all living players have already passed the action
            if self.action_description["num_pass_action"] >= len(players_alive) - 1:
                self.status["current_match_state"] = "action_confirmed"
                return {"event": "action_confirmed",
                "action": action,
                "player_id": source_id,
                "target_id": target_id}
            else:
                return {"event": "action_pass_registered", "player_id": player_id}
            
        elif event == "block":
            # Catch errors
            if player_id == self.action_description["source_id"]:
                raise ValueError("You can not block your own action.")
            if action not in ["foreign_aid", "assassinate", "steal"]:
                raise ValueError("This action can not be blocked.")
            
            self.action_description["blocker_id"] = player_id
            self.action_description["num_pass_block"] = 0
            self.status["current_match_state"] = "block_declared"
            return {"event": "block_declared",
                    "action": action,
                    "player_id": source_id,
                    "target_id": target_id,
                    "blocker_id": player_id}
        
        elif event == "challenge":
            # Catch errors
            if player_id == self.action_description["source_id"]:
                raise ValueError("You can not challenge your own action.")
            if action not in ["tax", "assassinate", "steal", "exchange"]:
                raise ValueError("The current action can not be challenged.")
            
            self.status["current_match_state"] = "challenge_confirmed"
            return {"event": "challenge_confirmed",
                    "action": action,
                    "player_id": source_id,
                    "target_id": target_id,
                    "challenger_id": player_id}
        
    # Processes the action while the state is "block_declared"
    def process_event_while_block_declared(self, player_id: str, data: dict):
        event = data.get("event")
        action = self.action_description["action"]
        source_id = self.action_description["source_id"]
        target_id = self.action_description["target_id"]
        blocker_id = self.action_description["blocker_id"]

        if event not in ["pass", "challenge"]:
            raise ValueError("You can not do it right now.")
        
        elif event == "pass":
            # Catch errors
            if player_id == blocker_id:
                raise ValueError("You can not pass your own block.")
            
            self.action_description["num_pass_block"] += 1
            players_alive = [p for p in self.players.values() if p.alive]
            
            # if all living players have already passed the block
            if self.action_description["num_pass_block"] >= len(players_alive) - 1:
                self.status["current_match_state"] = "block_confirmed"
                return {"event": "block_confirmed",
                        "action": action,
                        "player_id": source_id,
                        "target_id": target_id,
                        "blocker_id": blocker_id}
            else:
                return {"event": "block_pass_registered", "player_id": player_id}
        
        elif event == "challenge":
            # Catch errors
            if player_id == blocker_id:
                raise ValueError("You can not challenge your own block.")
            
            self.status["current_match_state"] = "challenge_confirmed"
            return {"event": "challenge_confirmed",
                    "action": action,
                    "source_id": source_id,
                    "target_id": target_id,
                    "challenger_id": player_id}  
        
    # Processes the action while the state is "waiting_card_loss"
    def process_event_while_card_loss(self, player_id: str, data: dict):
        pass

    # Processes the action while the state is "waiting_exchange"
    def process_event_while_waiting_exchange(self, player_id: str, data: dict):
        pass

    # Reset the state of the match and starts a new turn 
    def end_current_turn(self):
        self.status["current_match_state"] = "waiting_action"
        self.action_description = {"source_id": None,
                                   "target_id": None,
                                    "action": None,
                                    "blocker_id": None,
                                    "challenger_id": None,
                                    "num_pass_action": 0,
                                    "num_pass_block": 0}
    
    # Add coins to a player in the match
    def add_coins_to_player(self, player_id: str, coins: int):
        self.players[player_id].coins += coins
    
    # Steal coins from target_id and give it to source_id
    def steal_coins(self, source_id: str, target_id: str, coins: int):
        if self.players[target_id].coins < coins:
            raise ValueError("The target player does not have enough coins.")
        self.add_coins_to_player(source_id, coins)
        self.add_coins_to_player(target_id, -coins)