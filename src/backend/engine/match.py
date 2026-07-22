import random
from backend.engine.player import Player
from backend.engine.deck import Deck


DEFAULT_BASE_CARDS = ["Ambassador", "Assassin", "Captain", "Contessa", "Duke"]
ALL_ACTIONS = ["income", "foreing_aid", "coup", "tax", "assassinate", "steal", "exchange"]

# Not currently a lobby-configurable setting (settings.js has no
# assassinate_cost field), kept as a named constant instead of a bare "3"
# so it's at least legible, rather than silently invented as a new setting.
DEFAULT_ASSASSINATE_COST = 3


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
        reformation: bool = False,
        declared_coup: bool = False,
        declared_assassinate: bool = False,
    ):
        self.id = id
        self.players = {}
        self.status = {"started": False, # status of the match
                       "finished": False,
                       "current_match_state": None}
        self.order = [] # player order
        self.turn_id = 0 # indicates whose turn it is to play (order[turn_id])
        self.base_cards = base_cards if base_cards is not None else list(DEFAULT_BASE_CARDS)
        self.last_action = None

        # Ruleset values, provided by the lobby's MatchSettings rather than
        # hardcoded. coup_cost/forced_coup_threshold/assassinate_cost drive
        # get_options() below; income_coins/foreign_aid_coins are threaded
        # through and stored for when action resolution (currently stubbed
        # out in process_event's "action_declared" branch) actually applies
        # coin gains — nothing to wire them into yet, but they shouldn't
        # need to be re-threaded later either.
        self.coup_cost = coup_cost
        self.forced_coup_threshold = forced_coup_threshold
        self.assassinate_cost = assassinate_cost
        self.income_coins = income_coins
        self.foreign_aid_coins = foreign_aid_coins
        self.reformation = reformation
        self.declared_coup = declared_coup
        self.declared_assassinate = declared_assassinate

    # Adds a player to the match
    def add_player(self, id: str, name: str):
        if self.status["started"]:
            raise ValueError("The match is not accepting new players.")
        elif len(self.order) == 10:
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
        # Per explicit product direction (not a hard-coded engine opinion):
        # player count is never a reason to refuse a start. A lobby with
        # bot_fill=none and a single human is a legitimate (if degenerate)
        # match. Only a genuinely empty lobby can't start, there's no one
        # to take a turn.
        if num_players < 1:
            raise ValueError("At least 1 player is required to start.")
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
        for player_id in self.order:
            player = self.players[player_id]
            if(player.alive and len(player.cards) == 0):
                player.alive = False

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
        self.check_elimination()
        winner = self.check_winner()
        if winner is not None:
            self.status["finished"] = True
            self.status["current_match_state"] = "end_of_match"
            return{"event": "end_of_match",
                   "winner": winner.id}
        else:
            player = self.next_player()
            options = self.get_options(player.id)
            return{"event": "new_turn",
                   "player": player.id,
                   "options": options}
    
    # Processes events related to player actions and challenges
    def process_event(self, player_id: str, data: dict):
        event = data.get("event")
        if self.status["current_match_state"] == "waiting_action":
            action = data.get("action")
            if player_id != self.order[self.turn_id]:
                raise ValueError("It is not your turn.")
            if event == "action" and action not in ALL_ACTIONS:
                raise ValueError("This action is not available.")
            target_id = data.get("target_id")
            self.last_action = {"action": action, "player_id": player_id, "target_id": target_id}
            self.status["current_match_state"] = "action_declared"
            return {"event": "action",
                    "action": action,
                    "player_id": player_id}
        elif self.status["current_match_state"] == "action_declared":
            if event == "pass":
                # implement the pass logic
                pass
            elif event == "block":
                # Implement the block logic
                pass
            elif event == "challenge":
                # implement the challenge logic
                pass
    
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