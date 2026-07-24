import MatchSocket from '../net/match-socket.js';

// The single source of truth the match view renders from -- WebGLRenderer,
// SummaryPanel, HUD, and every menu all read from this same object rather
// than each keeping their own copy or reconstructing anything from event
// history (see the Match View spec, "Overall Client Architecture" /
// "Networking Architecture"). Nothing in here ever infers hidden
// information or assumes a transition happened locally: every field is
// set directly from something the server just sent.
const GameState = (() => {
	let state = blankState();
	const subscribers = new Set();

	function blankState() {
		return {
			connected: false,
			localPlayerId: null,
			// Lobby-shaped fields from the initial snapshot. Mostly
			// vestigial once a match is actually running, kept around
			// for things like a "back to lobby" link after the match ends.
			matchId: null,
			lobbyName: null,
			hostId: null,
			// Game-shaped fields -- null until game_state/match_event
			// first arrives (i.e. the match hasn't started yet, or this
			// tab connected before start_match landed).
			phase: null,
			finished: false,
			turnOrder: [],
			turnPlayerId: null,
			players: {},
			turnDescription: null,
			yourHand: [],
			winner: null,
			lastEliminated: [],
			// Ruleset values from MatchSettings (see backend/constants.py's
			// MATCH_SETTINGS_SCHEMA), sent once on state_snapshot and never
			// pushed again -- a match's settings don't change once it has
			// started. HUD/Summary Panel read costs and the time-bank
			// token count from here rather than hardcoding defaults.
			settings: null,
			// The raw event that produced the current state, if any --
			// not needed to know what the match *is* (that's everything
			// above), only useful to something that wants to animate the
			// transition that just happened. Never read to derive state.
			lastEvent: null,
		};
	}

	function setState(patch) {
		state = { ...state, ...patch };
		for (const callback of subscribers) callback(state);
	}

	/** Translates the server's snake_case 'state'/'game_state' block
	 * (see backend/routers/websockets.py's _match_state_payload) into
	 * this store's shape. Returns {} if gameState is null (match hasn't
	 * started yet), so callers can spread it in unconditionally. */
	function fromWireGameState(gameState) {
		if (!gameState) return {};
		const players = {};
		for (const [id, p] of Object.entries(gameState.players || {})) {
			players[id] = {
				displayName: p.display_name,
				avatarUrl: p.avatar_url,
				coins: p.coins,
				alive: p.alive,
				numHiddenCards: p.num_hidden_cards,
				revealedCards: p.revealed_cards,
			};
		}
		const td = gameState.turn_description;
		return {
			phase: gameState.phase,
			finished: gameState.finished,
			turnOrder: gameState.turn_order || [],
			turnPlayerId: gameState.turn_player_id,
			players,
			turnDescription: td && {
				sourceId: td.source_id,
				targetId: td.target_id,
				action: td.action,
				declaredCard: td.declared_card,
				blockerId: td.blocker_id,
				challengerId: td.challenger_id,
				blockClaimedCard: td.block_claimed_card,
				exchangePlayerId: td.exchange_player_id,
				exchangeReturnCount: td.exchange_return_count,
				playersPassedAction: td.players_passed_action,
				playersPassedBlock: td.players_passed_block,
				cardLossPlayerId: td.card_loss_player_id,
			},
			yourHand: gameState.your_hand || [],
		};
	}

	/** Translates the wire 'settings' block (see websockets.py's
	 * _settings_payload) into camelCase. Returns null if settings is null
	 * so callers can tell "not received yet" apart from "received". */
	function fromWireSettings(settings) {
		if (!settings) return null;
		return {
			reformation: settings.reformation,
			botFill: settings.bot_fill,
			timeBank: settings.time_bank,
			turnTimer: settings.turn_timer,
			challengeTimer: settings.challenge_timer,
			characterCopies: settings.character_copies,
			declaredCoup: settings.declared_coup,
			declaredAssassinate: settings.declared_assassinate,
			startingCoins: settings.starting_coins,
			coupCost: settings.coup_cost,
			forcedCoupThreshold: settings.forced_coup_threshold,
			incomeCoins: settings.income_coins,
			foreignAidCoins: settings.foreign_aid_coins,
			assassinateCost: settings.assassinate_cost,
			extortCoins: settings.extort_coins,
			taxCoins: settings.tax_coins,
			exchangeDrawCards: settings.exchange_draw_cards,
			timeBankCount: settings.time_bank_count,
			cardsPerPlayer: settings.cards_per_player,
		};
	}

	function handleMessage(type, payload) {
		if (type === 'state_snapshot') {
			setState({
				connected: true,
				localPlayerId: payload.local_player_id,
				matchId: payload.match_id,
				lobbyName: payload.lobby_name,
				hostId: payload.host_id,
				settings: fromWireSettings(payload.settings),
				...fromWireGameState(payload.game_state),
			});
			return;
		}

		if (type === 'match_event') {
			const { state: wireState, ...event } = payload;
			setState({
				...fromWireGameState(wireState),
				lastEvent: event,
				winner: event.event === 'end_of_match' ? event.winner : state.winner,
				lastEliminated: event.last_eliminated ?? state.lastEliminated,
			});
			return;
		}

		// Lobby-shaped leftovers (player_connection_changed etc.) that can
		// still arrive on this same socket -- nothing in the match view
		// needs them yet, deliberately ignored rather than guessed at.
	}

	function connect(matchId) {
		MatchSocket.onMessage(handleMessage);
		MatchSocket.onConnectionChange((connected) => setState({ connected }));
		MatchSocket.connect(matchId);
	}

	function disconnect() {
		MatchSocket.disconnect();
		state = blankState();
	}

	/** Called with the full current state immediately, then again on every
	 * change. Returns an unsubscribe function. */
	function subscribe(callback) {
		subscribers.add(callback);
		callback(state);
		return () => subscribers.delete(callback);
	}

	function getState() {
		return state;
	}

	// ---- Action-sending wrappers ------------------------------------------
	// Thin request wrappers, one per ClientEvent the backend accepts (see
	// backend/engine/enums.py). Each returns the ack/error promise so a
	// caller (an action menu, a contestation menu, ...) can catch a
	// rejected INVALID_ACTION and show it, rather than this module making
	// UI decisions on their behalf.

	function chooseAction(action, targetPlayerId = null, declaredCard = null) {
		return MatchSocket.sendRequest('chosen_action', {
			action,
			target_player_id: targetPlayerId,
			declared_card: declaredCard,
		});
	}

	function pass() {
		return MatchSocket.sendRequest('pass', {});
	}

	function block(claimedCard) {
		return MatchSocket.sendRequest('block', { claimed_card: claimedCard });
	}

	function challenge() {
		return MatchSocket.sendRequest('challenge', {});
	}

	function revealCards() {
		return MatchSocket.sendRequest('reveal_cards', {});
	}

	function selectCard(card) {
		return MatchSocket.sendRequest('selected_card', { selected_card: card });
	}

	function selectCards(cards) {
		return MatchSocket.sendRequest('selected_cards', { selected_cards: cards });
	}

	return {
		connect,
		disconnect,
		subscribe,
		getState,
		chooseAction,
		pass,
		block,
		challenge,
		revealCards,
		selectCard,
		selectCards,
	};
})();

export default GameState;
