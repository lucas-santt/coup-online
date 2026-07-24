import GameState from '../state/game-state.js';
import { escapeHtml } from './dom-utils.js';
import { actionLabel } from './labels.js';

const MAX_LOG_ENTRIES = 12;

const ActionLog = (() => {
	let els = null;
	let lastEvent = null;
	const entries = [];

	function init() {
		els = {
			panel: document.getElementById('action-log'),
			list: document.getElementById('action-log-list'),
		};
		GameState.subscribe(render);
	}

	function render(state) {
		if (!state.lastEvent || state.lastEvent === lastEvent) return;
		lastEvent = state.lastEvent;

		const line = formatEvent(state.lastEvent, state);
		if (!line) return;
		entries.unshift(line);
		if (entries.length > MAX_LOG_ENTRIES) entries.length = MAX_LOG_ENTRIES;
		els.panel.classList.remove('hidden');
		els.list.innerHTML = entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
	}

	function formatEvent(event, state) {
		switch (event.event) {
			case 'action_declared':
				return actionLine(event, state);
			case 'action_confirmed':
				if (event.lost_card && event.loser_id) return lossLine(event.loser_id, event.lost_card, state);
				return ['income', 'coup'].includes(event.action) ? actionLine(event, state) : '';
			case 'block_declared':
				return `${name(event.blocker_id, state)} blocks with ${event.claimed_card || event.block_claimed_card || '?'}`;
			case 'action_challenge_confirmed':
			case 'block_challenge_confirmed':
				return `${name(event.challenger_id, state)} contests`;
			case 'waiting_exchange':
				return event.reveal?.lost_card
					? lossLine(event.reveal.player_id, event.reveal.lost_card, state)
					: '';
			case 'turn_resolved':
				if (event.lost_card) {
					return lossLine(event.target_id || event.player_id || event.loser_id, event.lost_card, state);
				}
				return '';
			default:
				return '';
		}
	}

	function actionLine(event, state) {
		const actorId = event.player_id || event.source_id;
		const targetId = event.target_id;
		switch (event.action) {
			case 'steal':
				return `${name(actorId, state)} extorts ${name(targetId, state)}`;
			case 'coup':
			case 'assassinate':
				return `${name(actorId, state)} uses ${actionLabel(event.action)} on ${name(targetId, state)}${event.declared_card ? ` (${event.declared_card})` : ''}`;
			default:
				return `${name(actorId, state)} uses ${actionLabel(event.action)}`;
		}
	}

	function lossLine(playerId, card, state) {
		return `${name(playerId, state)} loses ${card}`;
	}

	function name(playerId, state) {
		if (!playerId) return 'Someone';
		if (playerId === state.localPlayerId) return 'You';
		return state.players[playerId]?.displayName || 'Someone';
	}

	return { init };
})();

export default ActionLog;
