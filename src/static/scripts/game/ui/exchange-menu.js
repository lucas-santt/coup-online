import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr } from './dom-utils.js';
import { describeDecision } from './match-text.js';

const ExchangeMenu = (() => {
	let els = null;
	let isOpen = false;
	let awaitingResponse = false;
	let selectedIndexes = new Set();
	let keepCount = 2;

	function init() {
		els = {
			menu: document.getElementById('exchange-menu'),
			hint: document.getElementById('exchange-hint'),
			count: document.getElementById('exchange-count'),
			list: document.getElementById('exchange-list'),
			confirm: document.getElementById('exchange-confirm'),
		};
		els.confirm.addEventListener('click', handleConfirm);
		GameState.subscribe(render);
	}

	function render(state) {
		const decision = describeDecision(state);
		const isMine = decision.kind === 'exchange' && decision.playerId === state.localPlayerId;
		if (!isMine || !state.yourHand.length) {
			awaitingResponse = false;
			close();
			return;
		}
		if (awaitingResponse) return;
		open(state);
	}

	function open(state) {
		keepCount = state.settings?.cardsPerPlayer || 2;
		selectedIndexes = new Set();
		els.hint.textContent = `Choose ${keepCount} to keep`;
		els.list.innerHTML = state.yourHand.map(cardMarkup).join('');
		els.list.querySelectorAll('.exchange-card').forEach((el) => {
			el.addEventListener('click', () => toggleCard(Number(el.dataset.index)));
		});
		updateSelection();
		els.menu.classList.remove('hidden');
		isOpen = true;
	}

	function close() {
		if (!isOpen) return;
		els.menu.classList.add('hidden');
		els.list.innerHTML = '';
		selectedIndexes = new Set();
		isOpen = false;
	}

	function cardMarkup(card, index) {
		return `
			<button type="button" class="exchange-card" data-index="${index}" data-card="${escapeAttr(card)}" aria-pressed="false">
				<span class="exchange-card-name">${escapeHtml(card)}</span>
			</button>`;
	}

	function toggleCard(index) {
		if (selectedIndexes.has(index)) {
			selectedIndexes.delete(index);
		} else if (selectedIndexes.size < keepCount) {
			selectedIndexes.add(index);
		}
		updateSelection();
	}

	function updateSelection() {
		els.list.querySelectorAll('.exchange-card').forEach((el) => {
			const selected = selectedIndexes.has(Number(el.dataset.index));
			el.classList.toggle('is-selected', selected);
			el.setAttribute('aria-pressed', selected ? 'true' : 'false');
		});
		els.count.textContent = `${selectedIndexes.size}/${keepCount} selected`;
		els.confirm.disabled = selectedIndexes.size !== keepCount;
	}

	function handleConfirm() {
		if (selectedIndexes.size !== keepCount) return;
		const cards = Array.from(selectedIndexes)
			.sort((a, b) => a - b)
			.map((index) => els.list.querySelector(`.exchange-card[data-index="${index}"]`)?.dataset.card)
			.filter(Boolean);

		awaitingResponse = true;
		close();
		GameState.selectCards(cards).catch((err) => {
			console.warn('selected_cards rejected:', err?.detail || err);
			awaitingResponse = false;
			render(GameState.getState());
		});
	}

	return { init };
})();

export default ExchangeMenu;
