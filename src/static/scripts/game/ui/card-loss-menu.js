import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr } from './dom-utils.js';
import { describeDecision } from './match-text.js';

// The main way to lose a card is expected to stay the 3D scene (spec
// §7.4-ish -- clicking your own card there), but that's not friendly on
// mobile where the WebGL view is hard to use, and there was previously
// no DOM fallback at all. This is a plain button list, not a radial
// menu -- picking a card to lose isn't a "direction" choice the way
// actions/targets/responses are, and a flat list reads better with a
// hand that might hold two copies of the same character.
const CardLossMenu = (() => {
	let els = null;
	let isOpen = false;
	// Same shape of guard as action-menu.js's awaitingTarget /
	// contest-menu.js's awaitingResponse -- set the instant a card is
	// picked, cleared once the next real state update lands, so this
	// doesn't flash back open while our own request is still in flight.
	let awaitingResponse = false;

	function init() {
		els = {
			menu: document.getElementById('card-loss-menu'),
			hint: document.getElementById('card-loss-hint'),
			list: document.getElementById('card-loss-list'),
		};
		GameState.subscribe(render);
	}

	function render(state) {
		const decision = describeDecision(state);
		const isMine = decision.kind === 'card-loss' && decision.playerId === state.localPlayerId;
		if (!isMine || !state.yourHand.length) {
			awaitingResponse = false;
			close();
			return;
		}
		if (awaitingResponse) return;
		open(state);
	}

	function open(state) {
		els.hint.textContent = 'Choose a card to lose';
		els.list.innerHTML = state.yourHand.map(cardMarkup).join('');
		els.list.querySelectorAll('.card-loss-option').forEach((el) => {
			el.addEventListener('click', () => handleChoose(el.dataset.card));
		});
		els.menu.classList.remove('hidden');
		isOpen = true;
	}

	function close() {
		if (!isOpen) return;
		els.menu.classList.add('hidden');
		els.list.innerHTML = '';
		isOpen = false;
	}

	function cardMarkup(card) {
		return `
			<button type="button" class="card-loss-option" data-card="${escapeAttr(card)}">
				${escapeHtml(card)}
			</button>`;
	}

	function handleChoose(card) {
		awaitingResponse = true;
		close();
		GameState.selectCard(card).catch((err) => {
			// Rejected -- the server never advanced, so the next
			// GameState update still says we owe a card and render()
			// reopens this on its own. See contest-menu.js's
			// handleChoose for the same server-authoritative shape.
			console.warn('selected_card rejected:', err?.detail || err);
			awaitingResponse = false;
			render(GameState.getState());
		});
	}

	return { init };
})();

export default CardLossMenu;
