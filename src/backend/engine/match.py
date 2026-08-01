import random
from typing import Any

from backend.engine.enums import Card, Religion, MatchEvent
from backend.engine.player import Player

# Importando os novos módulos da refatoração
from backend.engine.match_state import MatchState
from backend.engine.match_events import MatchEventProcessor
from backend.engine.match_interactions import MatchInteractionResolver

class Match:

	def __init__(self, id: str, players: list[Player], **kwargs) -> None:
		# Inicializa o estado centralizado
		self.state = MatchState(id=id, players=players, **kwargs)
        
        # Inicializa os controladores passando a referência do estado
		self.event_processor = MatchEventProcessor(self.state)
		self.interaction_resolver = MatchInteractionResolver(self.state)

    # Exposição de propriedades essenciais para evitar quebrar roteadores externos
	@property
	def id(self): return self.state.id
	@property
	def players(self): return self.state.players
	@property
	def status(self): return self.state.status
	@property
	def turn_description(self): return self.state.turn_description
	@property
	def order(self): return self.state.order
	@property
	def turn_id(self): return self.state.turn_id

	def process_event(self, player_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
		return self.event_processor.process_event(player_id, data)

	def make_action(self) -> dict[str, Any]:
		return self.interaction_resolver.make_action()
        
	def cancel_action(self) -> dict[str, Any]:
		return self.interaction_resolver.cancel_action()

	def resolve_action_challenge(self) -> dict[str, Any]:
		return self.interaction_resolver.resolve_action_challenge()

	def resolve_block_challenge(self) -> dict[str, Any]:
		return self.interaction_resolver.resolve_block_challenge()


	# Shuffles turn order and the deck, deals hands, hands out starting
	# coins, and returns the first turn's info.
	def start_match(self) -> dict[str, Any]:
		random.shuffle(self.state.order)
		self.state.deck.shuffle()
		self._deal_cards()
		self._give_coins(self.state.starting_coins)
		if self.state.reformation:
			self._set_religions()
		self.state.status["started"] = True
		self.state.status["current_match_state"] = MatchEvent.WAITING_ACTION
		first_player = self.state.players[self.state.order[0]]
		return {
			"event": MatchEvent.NEW_TURN,
			"player": first_player.id,
			"options": self.state._get_options(first_player.id),
			"last_eliminated": [],
		}
	
	# Deals cards_per_player cards to each player
	def _deal_cards(self) -> None:
		for player_id in self.state.order:
			for _ in range(self.state.cards_per_player):
				card = self.state.deck.pop_card()
				self.state.players[player_id].cards.append(card)

	# Distributes an equal number of coins to each player
	def _give_coins(self, coins: int) -> None:
		for player_id in self.state.order:
			self.state.players[player_id].coins = coins

	# Returns the next living player to play
	def _next_player(self) -> Player:
		num_players = len(self.state.order)
		for _ in range(num_players):
			self.state.turn_id = (self.state.turn_id + 1) % num_players
			player = self.state.players[self.state.order[self.state.turn_id]]
			if player.alive:
				return player
		raise ValueError("There are no living players in the match.")

	def _set_religions(self):
		current_religion_idx = self.state.base_religions.index(random.choice(self.state.base_religions))
		n = len(self.state.base_religions)
		for player in self.state.players.values():
			player.religion = self.state.base_religions[current_religion_idx]
			current_religion_idx = (current_religion_idx + 1) % n
			
	# Returns the ids of players newly eliminated (out of cards) since the
	# last call. Player.alive is derived straight from len(cards) (see
	# engine.player.Player) -- there's no flag to flip here, just a record
	# of who's already been reported, so nobody is announced twice.
	def _check_elimination(self) -> list[str]:
		newly_eliminated = [
			player_id
			for player_id in self.state.order
			if not self.state.players[player_id].alive and player_id not in self.state._eliminated
		]
		self.state._eliminated.update(newly_eliminated)
		return newly_eliminated

	# Checks how many players are alive in the match. If there is only 1 (the winner), returns that player
	def _check_winner(self) -> Player | None:
		players_alive = [player for player in self.state.players.values() if player.alive]
		if len(players_alive) == 0:
			raise ValueError("There are no living players in the game.")
		if len(players_alive) == 1:
			return players_alive[0]
		return None

	# Checks for eliminations, checks if there is a winner, and otherwise returns the next player to play
	def new_turn(self) -> dict[str, Any]:
		self._end_current_turn()
		last_eliminated = self._check_elimination()
		winner = self._check_winner()
		if winner is not None:
			self.state.status["finished"] = True
			self.state.status["current_match_state"] = MatchEvent.END_OF_MATCH
			return {
				"event": MatchEvent.END_OF_MATCH,
				"winner": winner.id,
				"last_eliminated": last_eliminated,
			}

		player = self._next_player()
		players = {
			p.id: {"coins": p.coins, "alive": p.alive, "num_cards": len(p.cards)}
			for p in self.state.players.values()
		}
		return {
			"event": MatchEvent.NEW_TURN,
			"player": player.id,
			"options": self.state._get_options(player.id),
			"last_eliminated": last_eliminated,
			"players": players,
		}

	# Resets the state of the match and starts a new turn
	def _end_current_turn(self) -> None:
		self.state.status["current_match_state"] = MatchEvent.WAITING_ACTION
		self.state.turn_description = self.state._blank_turn_description()