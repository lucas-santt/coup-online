import random
from backend.engine.player import Player
from backend.engine.deck import Deck


DEFAULT_BASE_CARDS = ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]
ALL_ACTIONS = ["income", "foreing_aid", "coup", "tax", "assassinate", "steal", "exchange"]

# Now a lobby-configurable setting (constants.MATCH_SETTINGS_SCHEMA
# "assassinate_cost"); kept as a named default here too so this constructor
# still has a sane value if instantiated without going through a lobby's
# MatchSettings row.
DEFAULT_ASSASSINATE_COST = 3
DEFAULT_EXTORT_COINS = 2
DEFAULT_TAX_COINS = 3
DEFAULT_EXCHANGE_DRAW_CARDS = 2


class Match:
    def __init__(
        self,
        id: str,
        base_cards: list[str] | None = None,
        coup_cost: int = 7,
        forced_coup_threshold: int = 10,
        assassinate_cost: int = DEFAULT_ASSASSINATE_COST,
        income_coins: int = 1,
        foreign_aid_coins: int = 2,
        extort_coins: int = DEFAULT_EXTORT_COINS,
        tax_coins: int = DEFAULT_TAX_COINS,
        exchange_draw_cards: int = DEFAULT_EXCHANGE_DRAW_CARDS,
        reformation: bool = False,
        declared_coup: bool = False,
        declared_assassinate: bool = False,
    ):
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
        # "action_challenge_confirmed": an action challenge has been initiated and will be resolved immediately;
        # "block_challenge_confirmed": a block challenge has been initiated and will be resolved immediately;
        # "waiting_card_loss": a player with more than one card has lost influence and must choose one of their cards;
        # "waiting_exchange": a player used the "exchange" action and must return two cards to the deck;
        # "turn_resolved": declares the current turn resolved. The next step is to start a new turn.
        
        self.order = [] # player order
        self.turn_id = 0 # indicates whose turn it is to play (order[turn_id])
        self.base_cards = base_cards if base_cards is not None else list(DEFAULT_BASE_CARDS)
        self.last_action = None
        self.turn_description = {"source_id": None, # informations about the last action
                                           "target_id": None,
                                           "action": None,
                                           "blocker_id": None,
                                           "challenger_id": None,
                                           "players_passed_action": [], # number of players who accepted the last action (did not block or challenge)
                                           "players_passed_block": [],
                                           "pending_action": False,
                                           "card_loser_id": None}
        
        # Influences that can make the action
        self.action_cards = {
            "assassinate": ["Assassin"],
            "exchange": ["Ambassador"],
            "steal": ["Captain"],
            "tax": ["Duke"]
        }

        # Influences that can block the action
        self.block_cards = {
            "assassinate": ["Contessa"],
            "foreign_aid": ["Duke"],
            "steal": ["Ambassador", "Captain"]
        }
        
        # Ruleset values, provided by the lobby's MatchSettings rather than
        # hardcoded. coup_cost/forced_coup_threshold/assassinate_cost drive
        # get_options() below; income_coins/foreign_aid_coins/extort_coins/
        # tax_coins/exchange_draw_cards are threaded through and stored for
        # when action resolution (currently stubbed out in process_event's
        # "action_declared" branch) actually applies coin gains/exchange
        # draws — nothing to wire them into yet, but they shouldn't need to
        # be re-threaded later either.
        self.coup_cost = coup_cost
        self.forced_coup_threshold = forced_coup_threshold
        self.assassinate_cost = assassinate_cost
        self.income_coins = income_coins
        self.foreign_aid_coins = foreign_aid_coins
        self.extort_coins = extort_coins
        self.tax_coins = tax_coins
        self.exchange_draw_cards = exchange_draw_cards
        self.reformation = reformation
        self.declared_coup = declared_coup
        self.declared_assassinate = declared_assassinate

    # Adds a player to the match
    def add_player(self, id: str, name: str):
        if self.status["started"]:
            raise ValueError("The match is not accepting new players.")
        elif len(self.order) >= 10:
            raise ValueError("The match is already full.")
        if id in self.players:
            raise ValueError("You are already in the game.")
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
        # Per explicit product direction (not a hard-coded engine opinion):
        # player count is never a reason to refuse a start. A lobby with
        # bot_fill=none and a single human is a legitimate (if degenerate)
        # match. Only a genuinely empty lobby can't start, there's no one
        # to take a turn.
        if num_players < 1:
            raise ValueError("At least 1 player is required to start.")
        # If copies_by_card=None, choose default values
        if copies_by_card is not None:
            if copies_by_card > 0 and num_players > (2 * copies_by_card) + 2:
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
               "options": self.get_options(self.order[0]),
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
            return {"event": "end_of_match",
                    "winner": winner_id}
        else:
            player = self.next_player()
            options = self.get_options(player.id)
            # Gets state of players
            players = {}
            for player2 in self.players.values():
                players[player2.id] = {"coins": player2.coins,
                                    "alive": player2.alive,
                                    "num_cards": len(player2.cards)}
                
            return {"event": "new_turn",
                    "player": player.id,
                    "options": options,
                    "last_eliminated": last_eliminated,
                    "players": players}
    
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

        # If the current action or block was challenged
        elif current_state_match in ["action_challenge_confirmed", "block_challenge_confirmed"]:
            raise ValueError("You can not do that right now, there is an ongoing challenge.")
        
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
        if action not in self.get_options(player_id):
            if self.players[player_id].coins >= self.forced_coup_threshold:
                raise ValueError(f"You must choose 'coup' because you have {self.forced_coup_threshold} coins.")
            else:
                raise ValueError("This is not a valid option or you do not have enough money.")
        if action in ["coup", "assassinate", "steal"]:
            # If the target is not on game, if target is dead or the source and the target are the same
            if target_id not in self.order or player_id == target_id or not self.players[target_id].alive:
                raise ValueError("You can not do it with this player.")
            if action == "steal" and self.players[target_id].coins == 0:
                raise ValueError("You can not steal from a player with no coins.")
        
        # Gets action description
        self.turn_description = {"source_id": player_id,
                                   "target_id": target_id,
                                   "action": action,
                                   "blocker_id": None,
                                   "challenger_id": None,
                                   "players_passed_action": [],
                                   "players_passed_block": [],
                                   "pending_action": False,
                                   "card_loser_id": None}
        
        # If the action can not be blocked or challenged
        if action in ["income", "coup"]:
            self.status["current_match_state"] = "action_confirmed"
        else:
            # The match will wait for each player to confirm or not the action
            self.status["current_match_state"] = "action_declared"
            self.turn_description["players_passed_action"] = []
        # Collects the coins for the assassination
        if action == "assassinate":
            self.add_coins_to_player(player_id, -self.assassinate_cost)
        if action == "coup":
            self.add_coins_to_player(player_id, -self.coup_cost)
        return {"event": self.status["current_match_state"],
                "action": action,
                "player_id": player_id,
                "target_id": target_id}

    # Processes the action while the state is "action_declared"
    def process_event_while_action_declared(self, player_id: str, data: dict):
        event = data.get("event")
        action = self.turn_description["action"]
        source_id = self.turn_description["source_id"]
        target_id = self.turn_description["target_id"]

        if event not in ["pass", "block", "challenge"]:
            raise ValueError("You can not do it right now.")
        
        elif event == "pass":
            # Catch errors
            if player_id == source_id:
                raise ValueError("You can not pass your own action.")
            if player_id in self.turn_description["players_passed_action"]:
                raise ValueError("You have already done this.")
            
            self.turn_description["players_passed_action"].append(player_id)
            players_alive = [p for p in self.players.values() if p.alive]
            
            # if all living players have already passed the action
            if len(self.turn_description["players_passed_action"]) >= len(players_alive) - 1:
                self.status["current_match_state"] = "action_confirmed"
                return {"event": "action_confirmed",
                "action": action,
                "player_id": source_id,
                "target_id": target_id}
            else:
                return {"event": "action_pass_registered", "player_id": player_id}
            
        elif event == "block":
            # Catch errors
            if player_id == self.turn_description["source_id"]:
                raise ValueError("You can not block your own action.")
            if action not in ["foreign_aid", "assassinate", "steal"]:
                raise ValueError("This action can not be blocked.")
            if action in ["assassinate", "steal"] and player_id != target_id:
                raise ValueError("Only the target player can block this.")
            if player_id in self.turn_description["players_passed_action"]:
                raise ValueError("You have already passed.")
            
            self.turn_description["blocker_id"] = player_id
            self.turn_description["players_passed_block"] = []
            self.status["current_match_state"] = "block_declared"
            return {"event": "block_declared",
                    "action": action,
                    "player_id": source_id,
                    "target_id": target_id,
                    "blocker_id": player_id}
        
        elif event == "challenge":
            # Catch errors
            if player_id == self.turn_description["source_id"]:
                raise ValueError("You can not challenge your own action.")
            if action not in ["tax", "assassinate", "steal", "exchange"]:
                raise ValueError("The current action can not be challenged.")
            if player_id in self.turn_description["players_passed_action"]:
                raise ValueError("You have already passed.")
            
            self.status["current_match_state"] = "action_challenge_confirmed"
            self.turn_description["challenger_id"] = player_id

            return {"event": "action_challenge_confirmed",
                    "action": action,
                    "player_id": source_id,
                    "target_id": target_id,
                    "challenger_id": player_id}
        
    # Processes the action while the state is "block_declared"
    def process_event_while_block_declared(self, player_id: str, data: dict):
        event = data.get("event")
        action = self.turn_description["action"]
        source_id = self.turn_description["source_id"]
        target_id = self.turn_description["target_id"]
        blocker_id = self.turn_description["blocker_id"]

        if event not in ["pass", "challenge"]:
            raise ValueError("You can not do it right now.")
        
        elif event == "pass":
            # Catch errors
            if player_id == blocker_id:
                raise ValueError("You can not pass your own block.")
            if player_id in self.turn_description["players_passed_block"]:
                raise ValueError("You have already done this.")
            
            self.turn_description["players_passed_block"].append(player_id)
            players_alive = [p for p in self.players.values() if p.alive]
            
            # if all living players have already passed the block
            if len(self.turn_description["players_passed_block"]) >= len(players_alive) - 1:
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
            if player_id in self.turn_description["players_passed_block"]:
                raise ValueError("You have already passed.")
            
            self.status["current_match_state"] = "block_challenge_confirmed"
            self.turn_description["challenger_id"] = player_id

            return {"event": "block_challenge_confirmed",
                    "action": action,
                    "source_id": source_id,
                    "target_id": target_id,
                    "challenger_id": player_id}  
        
    # Processes the action while the state is "waiting_card_loss"
    def process_event_while_card_loss(self, player_id: str, data: dict):
        event = data.get("event")
        target_id = self.turn_description["target_id"]
        card_loser_id = self.turn_description["card_loser_id"]
        action = self.turn_description["action"]
        source_id = self.turn_description["source_id"]

        # Catch errors
        if player_id != card_loser_id:
            raise ValueError("It is not your turn.")
        if event != "selected_card":
            raise ValueError("You must choose one card to lose.")
        
        selected_card = data.get("selected_card")
        player = self.players[player_id]
        if selected_card not in self.players[player_id].cards:
            raise ValueError("You need to select cards that you own.")
        player.cards.remove(selected_card)
        if self.turn_description["pending_action"]:
            self.status["current_match_state"] = "action_confirmed"
            return {"event":"action_confirmed",
                            "action": action,
                            "source_id": source_id,
                            "target_id": target_id,
                            "player_id": player_id,
                            "lost_card": selected_card}
        else:
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved",
                    "action": action,
                    "player_id": player_id,
                    "lost_card": selected_card}

    # Processes the action while the state is "waiting_exchange"
    def process_event_while_waiting_exchange(self, player_id: str, data: dict):
        event = data.get("event")
        source_id = self.turn_description["source_id"]
        selected_cards = data.get("selected_cards")

        # Catch errors
        if player_id != source_id:
            raise ValueError("It is not your turn.")
        if event != "selected_cards" or len(selected_cards) != self.exchange_draw_cards:
            raise ValueError(f"You must choose {self.exchange_draw_cards} cards to return to the deck.")
        
        for card in selected_cards:
            if card not in self.players[player_id].cards:
                raise ValueError("You need to select cards that you own.")
            self.players[player_id].cards.remove(card)
            self.deck.push_card(card)
        self.deck.shuffle()
        self.status["current_match_state"] = "turn_resolved"
        return {"event": "turn_resolved", 
                "action": "exchange", 
                "player_id": player_id}

    # Reset the state of the match and starts a new turn 
    def end_current_turn(self):
        self.status["current_match_state"] = "waiting_action"
        self.turn_description = {"source_id": None,
                                   "target_id": None,
                                    "action": None,
                                    "blocker_id": None,
                                    "challenger_id": None,
                                    "players_passed_action": [],
                                    "players_passed_block": [],
                                    "pending_action": False,
                                    "card_loser_id": None}
    
    # Makes the action described in description_action, given that the action has been confirmed
    def make_action(self):
        action = self.turn_description.get("action")
        source_id = self.turn_description.get("source_id")
        target_id = self.turn_description.get("target_id")

        if action == "income":
            self.add_coins_to_player(source_id, self.income_coins)
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved",
                    "action": action,
                    "source_id": source_id,
                    "target_id": target_id,
                    "lost_card": None}
        
        elif action == "foreign_aid":
            self.add_coins_to_player(source_id, self.foreign_aid_coins)
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved",
                    "action": action,
                    "source_id": source_id,
                    "target_id": target_id,
                    "lost_card": None}
    
        elif action == "coup":
            cards = self.players[target_id].cards
            if len(cards) == 1:
                lost_card = cards.pop()
                self.status["current_match_state"] = "turn_resolved"
                return {"event": "turn_resolved",
                        "action": action,
                        "source_id": source_id,
                        "target_id": target_id,
                        "lost_card": lost_card}
            else:
                self.status["current_match_state"] = "waiting_card_loss"
                self.turn_description["card_loser_id"] = target_id
                return {"event": "waiting_card_loss",
                        "player_id": target_id,
                        "cards": cards}
            
        elif action == "tax":
            self.add_coins_to_player(source_id, self.tax_coins)
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved",
                    "action": action,
                    "source_id": source_id,
                    "target_id": target_id,
                    "lost_card": None}

        elif action == "assassinate":
            cards = self.players[target_id].cards
            if len(cards) == 0:
                self.status["current_match_state"] = "turn_resolved"
                return {"event": "turn_resolved", 
                        "action": action, 
                        "source_id": source_id, 
                        "target_id": target_id, 
                        "lost_card": None}
            elif len(cards) == 1:
                lost_card = cards.pop()
                self.status["current_match_state"] = "turn_resolved"
                return {"event": "turn_resolved",
                        "action": action,
                        "source_id": source_id,
                        "target_id": target_id,
                        "lost_card": lost_card}
            else:
                self.turn_description["card_loser_id"] = target_id
                self.status["current_match_state"] = "waiting_card_loss"
                return {"event": "waiting_card_loss",
                        "player_id": target_id,
                        "cards": cards}
            
        elif action == "steal":
            stolen_coins = min(self.extort_coins, self.players[target_id].coins)
            self.steal_coins(source_id, target_id, stolen_coins)
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved",
                    "action": action,
                    "source_id": source_id,
                    "target_id": target_id,
                    "lost_card": None}
        
        elif action == "exchange":
            new_cards = []
            for _ in range(self.exchange_draw_cards):
                new_cards.append(self.deck.pop_card())
            self.players[source_id].cards += new_cards
            self.status["current_match_state"] = "waiting_exchange"
            return {"event": "waiting_exchange",
                    "player_id": source_id,
                    "new_cards": new_cards,
                    "cards": self.players[source_id].cards}
        
    # Add coins to a player in the match
    def add_coins_to_player(self, player_id: str, coins: int):
        self.players[player_id].coins += coins
    
    # Steal coins from target_id and give it to source_id
    def steal_coins(self, source_id: str, target_id: str, coins: int):
        if self.players[target_id].coins < coins:
            raise ValueError("The target player does not have enough coins.")
        self.add_coins_to_player(source_id, coins)
        self.add_coins_to_player(target_id, -coins)

    def resolve_action_challenge(self):
        action = self.turn_description.get("action")
        source_id = self.turn_description.get("source_id")
        challenger_id = self.turn_description.get("challenger_id")
        source_cards = self.players[source_id].cards
        challenger_cards = self.players[challenger_id].cards

        for card in source_cards:
            if card in self.action_cards[action]:
                # The challenger player lost the challenge
                new_card = self.deck.pop_card()
                source_cards.append(new_card)
                source_cards.remove(card)
                self.deck.push_card(card)
                self.deck.shuffle()
                self.turn_description["pending_action"] = True
                if len(challenger_cards) == 1:
                    lost_card = challenger_cards.pop()
                    self.status["current_match_state"] = "action_confirmed"
                    return {"event": "challenge_lost",
                            "source_id": source_id,
                            "challenger_id": challenger_id,
                            "lost_card": lost_card,
                            "revealed_card": card}
                else:
                    self.turn_description["card_loser_id"] = challenger_id
                    self.status["current_match_state"] = "waiting_card_loss"
                    return {"event": "waiting_card_loss",
                            "player_id": challenger_id,
                            "cards": challenger_cards,
                            "revealed_card": card}
                
        # The challenger player won the challenge
        self.turn_description["pending_action"] = False
        if len(source_cards) == 1:
            lost_card = source_cards.pop()
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "challenge_overcome",
                    "source_id": source_id,
                    "challenger_id": challenger_id,
                    "lost_card": lost_card}
        else:
            self.turn_description["card_loser_id"] = source_id
            self.status["current_match_state"] = "waiting_card_loss"
            return {"event": "waiting_card_loss",
                    "player_id": source_id,
                    "cards": source_cards}

    def resolve_block_challenge(self):
        action = self.turn_description.get("action")
        blocker_id = self.turn_description.get("blocker_id")
        challenger_id = self.turn_description.get("challenger_id")
        blocker_cards = self.players[blocker_id].cards
        challenger_cards = self.players[challenger_id].cards

        for card in blocker_cards:
            if card in self.block_cards[action]:
                # The challenger player lost the challenge
                new_card = self.deck.pop_card()
                blocker_cards.append(new_card)
                blocker_cards.remove(card)
                self.deck.push_card(card)
                self.deck.shuffle()
                self.turn_description["pending_action"] = False
                if len(challenger_cards) == 1:
                    lost_card = challenger_cards.pop()
                    self.status["current_match_state"] = "block_confirmed"
                    return {"event": "challenge_lost",
                            "blocker_id": blocker_id,
                            "challenger_id": challenger_id,
                            "lost_card": lost_card,
                            "revealed_card": card}
                else:
                    self.turn_description["card_loser_id"] = challenger_id
                    self.status["current_match_state"] = "waiting_card_loss"
                    return {"event": "waiting_card_loss",
                            "player_id": challenger_id,
                            "cards": challenger_cards,
                            "revealed_card": card}

        # The challenger player won the challenge
        self.turn_description["pending_action"] = True
        if len(blocker_cards) == 1:
            lost_card = blocker_cards.pop()
            self.status["current_match_state"] = "action_confirmed"
            return {"event": "challenge_overcome",
                    "blocker_id": blocker_id,
                    "challenger_id": challenger_id,
                    "lost_card": lost_card}
        else:
            self.turn_description["card_loser_id"] = blocker_id
            self.status["current_match_state"] = "waiting_card_loss"
            return {"event": "waiting_card_loss",
                    "player_id": blocker_id,
                    "cards": blocker_cards}

    def disconnect_player(self, player_id: str):
        if player_id not in self.players or not self.players[player_id].alive:
            return None

        current_match_state = self.status["current_match_state"]
        result = None

        if current_match_state in ["action_declared", "block_declared"]:
            if current_match_state == "action_declared" and player_id not in self.turn_description["players_passed_action"]:
                result = self.process_event(player_id, {"event": "pass"})
            elif current_match_state == "block_declared" and player_id not in self.turn_description["players_passed_block"]:
                result = self.process_event(player_id, {"event": "pass"})

        self.players[player_id].alive = False
        self.players[player_id].cards = []

        winner = self.check_winner()
        if winner is not None:
            self.status["finished"] = True
            self.status["current_match_state"] = "end_of_match"
            return {"event": "end_of_match",
                    "winner": winner.id, 
                    "last_eliminated": [player_id]}
        
        if current_match_state == "waiting_action" and self.order[self.turn_id] == player_id:
            return self.new_turn()
            
        if current_match_state == "waiting_card_loss" and self.turn_description.get("card_loser_id") == player_id:
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved",
                    "action": self.turn_description.get("action"),
                    "source_id": self.turn_description.get("source_id"),
                    "target_id": self.turn_description.get("target_id"),
                    "lost_card": None}
            
        if current_match_state == "waiting_exchange" and self.turn_description.get("source_id") == player_id:
            self.status["current_match_state"] = "turn_resolved"
            return {"event": "turn_resolved", 
                    "action": "exchange", 
                    "player_id": player_id}

        self.remove_player(player_id)
        
        return result
    
    # Returns a player's possible options given their number of coins.
    # Thresholds come from this match's own ruleset (self.coup_cost,
    # self.forced_coup_threshold, self.assassinate_cost) instead of the
    # previous hardcoded 10 / 7 / 3, so a lobby with a custom coup cost or
    # forced-coup threshold actually changes what's playable.
    def get_options(self, player_id: str):
        player = self.players[player_id]
        if player.coins >= self.forced_coup_threshold:
            return ["coup"]
        elif player.coins >= self.coup_cost:
            return list(ALL_ACTIONS)
        elif player.coins >= self.assassinate_cost:
            return [action for action in ALL_ACTIONS if action != "coup"]
        else:
            return [action for action in ALL_ACTIONS if action not in ("coup", "assassinate")]