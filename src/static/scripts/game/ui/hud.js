import GameState from '../state/game-state.js';
import { escapeHtml, avatarSrc } from './dom-utils.js';
import { describeDecision, headline } from './match-text.js';

const HUD = (() => {
	let els = null;

	function init() {
		els = {
			localAvatar: document.getElementById('hud-local-avatar'),
			localName: document.getElementById('hud-local-name'),
			localCoins: document.getElementById('hud-local-coins'),
			hand: document.getElementById('hud-hand'),
			phaseText: document.getElementById('hud-phase-text'),
			connectionBanner: document.getElementById('connection-banner'),
			eomBanner: document.getElementById('end-of-match-banner'),
			eomTitle: document.getElementById('eom-title'),
		};
		GameState.subscribe(render);
	}

	function render(state) {
		renderConnectionBanner(state);
		renderLocalPlayer(state);
		renderPhase(state);
		renderEndOfMatch(state);
	}

	function renderConnectionBanner(state) {
		// Only worth telling the player about once a match has actually
		// been seen -- avoids a flash of "reconnecting" while the very
		// first connection is still being established.
		const show = !state.connected && state.matchId;
		els.connectionBanner.classList.toggle('hidden', !show);
		if (show) els.connectionBanner.textContent = 'Reconnecting to the match…';
	}

	function renderLocalPlayer(state) {
		const me = state.players[state.localPlayerId];
		if (!me) {
			els.localAvatar.removeAttribute('src');
			els.localName.textContent = '';
			els.localCoins.textContent = '';
			els.hand.innerHTML = '';
			return;
		}

		els.localAvatar.src = avatarSrc(me.avatarUrl);
		els.localAvatar.alt = me.displayName || '';
		els.localName.textContent = me.displayName || 'You';
		els.localCoins.textContent = `${me.coins} coin${me.coins === 1 ? '' : 's'}`;

		// The player's own hand -- shown here (not just the 3D scene)
		// because the spec requires every piece of gameplay information
		// to be available through the HTML interface on its own, and
		// this pass doesn't touch the WebGL side at all.
		els.hand.innerHTML = state.yourHand
			.map((card) => `<span class="hud-hand-card">${escapeHtml(card)}</span>`)
			.join('');
	}

	function renderPhase(state) {
		const decision = describeDecision(state);
		els.phaseText.textContent = headline(decision, state.players, state.localPlayerId);
	}

	function renderEndOfMatch(state) {
		const show = state.finished && state.phase === 'end_of_match';
		els.eomBanner.classList.toggle('hidden', !show);
		if (!show) return;
		const winner = state.players[state.winner];
		els.eomTitle.textContent = winner
			? `${winner.displayName} wins!`
			: 'Match over';
	}

	return { init };
})();

export default HUD;
