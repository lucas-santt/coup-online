import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr } from './dom-utils.js';
import { actionLabel } from './labels.js';

const CARDS = ['Ambassador', 'Assassin', 'Captain', 'Contessa', 'Duke'];

const DeclareCardMenu = (() => {
	let els = null;
	let onBack = null;
	let pending = null;

	function init(options = {}) {
		onBack = options.onBack;
		els = {
			menu: document.getElementById('declare-card-menu'),
			hint: document.getElementById('declare-card-hint'),
			list: document.getElementById('declare-card-list'),
			back: document.getElementById('declare-card-back'),
		};
		els.back.addEventListener('click', back);
	}

	function open(action, targetPlayerId, state) {
		pending = { action, targetPlayerId };
		const targetName = state.players[targetPlayerId]?.displayName || 'target';
		els.hint.textContent = `Declare influence for ${actionLabel(action)} against ${targetName}`;
		els.list.innerHTML = CARDS.map(cardMarkup).join('');
		els.list.querySelectorAll('.declare-card-option').forEach((el) => {
			el.addEventListener('click', () => submit(el.dataset.card));
		});
		els.menu.classList.remove('hidden');
	}

	function close() {
		els.menu.classList.add('hidden');
		els.list.innerHTML = '';
		pending = null;
	}

	function cardMarkup(card) {
		return `
			<button type="button" class="declare-card-option" data-card="${escapeAttr(card)}">
				${escapeHtml(card)}
			</button>`;
	}

	function submit(card) {
		if (!pending) return;
		const { action, targetPlayerId } = pending;
		close();
		GameState.chooseAction(action, targetPlayerId, card).catch((err) => {
			console.warn('declared chosen_action rejected:', err?.detail || err);
			onBack?.();
		});
	}

	function back() {
		close();
		onBack?.();
	}

	return { init, open, close };
})();

export default DeclareCardMenu;
