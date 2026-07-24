import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr, avatarSrc } from './dom-utils.js';
import { describeDecision } from './match-text.js';
import { actionLabel as label } from './labels.js';

const SummaryPanel = (() => {
	let els = null;
	// No hover on touch -- computed once at init rather than re-checked
	// per render, since a device's pointer type doesn't change mid-match
	// and this keeps the render path simple (see the spec's "keep it
	// simple" convention).
	let isTouch = false;

	function init() {
		els = {
			panel: document.getElementById('summary-panel'),
			tab: document.getElementById('summary-panel-tab'),
			pin: document.getElementById('summary-panel-pin'),
			list: document.getElementById('summary-panel-list'),
		};
		isTouch = window.matchMedia('(hover: none)').matches;
		els.panel.classList.toggle('is-touch', isTouch);

		if (isTouch) {
			els.tab.addEventListener('click', () => {
				els.panel.classList.toggle('is-open');
				els.tab.setAttribute('aria-expanded', els.panel.classList.contains('is-open'));
			});
		} else {
			els.panel.addEventListener('mouseenter', () => els.panel.classList.add('is-hovered'));
			els.panel.addEventListener('mouseleave', () => els.panel.classList.remove('is-hovered'));
			els.pin.addEventListener('click', () => {
				const pinned = els.panel.classList.toggle('is-pinned');
				els.pin.setAttribute('aria-pressed', String(pinned));
			});
		}

		GameState.subscribe(render);
	}

	function render(state) {
		if (!state.turnOrder.length) {
			els.list.innerHTML = '<p class="summary-empty">Waiting for the match to start…</p>';
			return;
		}
		const decision = describeDecision(state);
		els.list.innerHTML = state.turnOrder.map((id) => playerRow(state, id, decision)).join('');
	}

	function playerRow(state, playerId, decision) {
		const player = state.players[playerId];
		if (!player) return '';
		const isLocal = playerId === state.localPlayerId;
		const isActive =
			(decision.kind === 'turn' && decision.playerId === playerId) ||
			(decision.kind === 'card-loss' && decision.playerId === playerId) ||
			(decision.kind === 'exchange' && decision.playerId === playerId);

		const nameLine = `
			<div class="summary-player-name-row">
				${isActive ? '<span class="summary-active-marker" aria-hidden="true">▶</span>' : ''}
				<span class="summary-player-name">${escapeHtml(player.displayName)}${isLocal ? ' (You)' : ''}</span>
			</div>`;

		const outClass = player.alive ? '' : ' is-out';

		// A pending declared claim temporarily takes over this player's
		// row instead of their usual coins/cards -- see spec 5.3's
		// "Pending action" example -- so nobody looking elsewhere misses
		// the declaration.
		if (decision.kind === 'pending-claim' && decision.actorId === playerId) {
			return `
				<div class="summary-player-row is-pending${outClass}">
					<img class="summary-avatar" src="${escapeAttr(avatarSrc(player.avatarUrl))}" alt="">
					<div class="summary-player-body">
						${nameLine}
						<div class="summary-claim">
							<span class="summary-claim-label">Claim:</span>
							<span class="summary-claim-value">${escapeHtml(decision.claim)} (${escapeHtml(label(decision.action))})</span>
						</div>
						<div class="summary-waiting">Waiting for responses…</div>
					</div>
				</div>`;
		}
		if (decision.kind === 'pending-block' && decision.blockerId === playerId) {
			return `
				<div class="summary-player-row is-pending${outClass}">
					<img class="summary-avatar" src="${escapeAttr(avatarSrc(player.avatarUrl))}" alt="">
					<div class="summary-player-body">
						${nameLine}
						<div class="summary-claim">
							<span class="summary-claim-label">Blocks with:</span>
							<span class="summary-claim-value">${escapeHtml(decision.claim || '?')}</span>
						</div>
						<div class="summary-waiting">Waiting for responses…</div>
					</div>
				</div>`;
		}

		const activeLabel = activeDecisionLabel(decision, playerId);
		const cardsLine = isLocal
			? cardsLineForLocal(state)
			: cardsLineForOther(player);
		const timeBank = timeBankLine(state);

		return `
			<div class="summary-player-row${outClass}">
				<img class="summary-avatar" src="${escapeAttr(avatarSrc(player.avatarUrl))}" alt="">
				<div class="summary-player-body">
					${nameLine}
					${!player.alive ? '<div class="summary-status">Out — spectating</div>' : ''}
					${activeLabel ? `<div class="summary-status">${escapeHtml(activeLabel)}</div>` : ''}
					${player.alive ? `<div class="summary-coins">${player.coins} coin${player.coins === 1 ? '' : 's'}</div>` : ''}
					${player.alive ? cardsLine : ''}
					${player.alive ? timeBank : ''}
				</div>
			</div>`;
	}

	function activeDecisionLabel(decision, playerId) {
		if (decision.kind === 'turn' && decision.playerId === playerId) return 'Choosing Action';
		if (decision.kind === 'card-loss' && decision.playerId === playerId) return 'Choosing Card to Lose';
		if (decision.kind === 'exchange' && decision.playerId === playerId) return 'Choosing Exchange Cards';
		return null;
	}

	function cardsLineForOther(player) {
		const hidden = '<span class="summary-card-pip" title="Hidden card"></span>'.repeat(player.numHiddenCards);
		const revealed = player.revealedCards
			.map((c) => `<span class="summary-card-revealed">${escapeHtml(c)}</span>`)
			.join('');
		return `
			<div class="summary-cards">
				${hidden ? `<span class="summary-cards-label">Hidden:</span> ${hidden}` : ''}
				${revealed ? `<div class="summary-cards-revealed-row"><span class="summary-cards-label">Revealed:</span> ${revealed}</div>` : ''}
			</div>`;
	}

	function cardsLineForLocal(state) {
		const hand = state.yourHand.map((c) => `<span class="summary-card-revealed is-own">${escapeHtml(c)}</span>`).join('');
		return `<div class="summary-cards">${hand}</div>`;
	}

	// Flat hourglass silhouette, same inline-SVG treatment as the pin icon
	// above and the Action Menu's custom action icons -- previously each
	// token was a plain gold circle, which read as a second coin count
	// rather than a distinct resource.
	const HOURGLASS_ICON = '<svg class="summary-token-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 2H18V4L13 12L18 20V22H6V20L11 12L6 4V2Z"/></svg>';

	function timeBankLine(state) {
		const count = state.settings?.timeBankCount;
		if (!count) return '';
		// Spent-token tracking isn't implemented server-side yet (see the
		// spec's "known engine gaps" -- timers/time bank spending land in
		// a later pass), so every token renders as available for now.
		const tokens = `<span class="summary-token" title="Time bank token">${HOURGLASS_ICON}</span>`.repeat(count);
		return `<div class="summary-time-bank"><span class="summary-cards-label">Time Bank:</span> ${tokens}</div>`;
	}

	return { init };
})();

export default SummaryPanel;
