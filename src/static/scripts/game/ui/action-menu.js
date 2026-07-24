import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr } from './dom-utils.js';
import { actionLabel, actionDescription, ACTION_CLAIMS, TARGETED_ACTIONS, cardArtUrl } from './labels.js';
import { layoutWedges, bindRadialKeys, bindTouchTooltips, bindPointerTooltips } from './radial-menu.js';
import TargetMenu from './target-menu.js';
import DeclareCardMenu from './declare-card-menu.js';

// Fixed wedge order, 1-7 (spec §7.1's "Keyboard shortcuts"): Income,
// Foreign Aid, Coup, Tax, Assassinate, Extort, Exchange.
const ACTIONS = ['income', 'foreign_aid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'];

const ACTION_ICONS = {
	income: 'income.png',
	foreign_aid: 'external-aid.png',
	coup: 'coup.png',
	tax: 'tax.png',
	assassinate: 'assassinate.png',
	steal: 'extort.png',
	exchange: 'exchange.png',
};

const ActionMenu = (() => {
	let els = null;
	let isTouch = false;
	let unbindKeys = null;
	// True while Target Selection (or the two-player auto-target request)
	// is handling a targeted action the player already picked here --
	// keeps this menu hidden even though GameState still says it's the
	// local player's turn, since nothing has been sent to the server yet
	// and a "Back" tap should be able to bring this menu back rather than
	// re-deriving that entirely from wire state.
	let awaitingTarget = false;
	let isOpen = false;

	function init() {
		els = {
			menu: document.getElementById('action-menu'),
			wedges: document.getElementById('action-menu-wedges'),
			hint: document.getElementById('action-menu-hint'),
		};
		isTouch = window.matchMedia('(hover: none)').matches;
		els.menu.classList.toggle('is-touch', isTouch);
		bindTouchTooltips(els.menu);
		bindPointerTooltips(els.menu);
		TargetMenu.init({ onBack: reopenAfterBack, onChooseTarget: handleTargetSelected });
		DeclareCardMenu.init({ onBack: reopenAfterBack });
		GameState.subscribe(render);
	}

	function render(state) {
		const me = state.players[state.localPlayerId];
		const myTurn = state.phase === 'waiting_action' && state.turnPlayerId === state.localPlayerId;

		if (!myTurn || !me) {
			awaitingTarget = false;
			close();
			return;
		}
		if (awaitingTarget) {
			// Target Selection (or an in-flight auto-target request) owns
			// the screen right now -- leave it alone.
			return;
		}
		open(state, me);
	}

	function open(state, me) {
		els.hint.textContent = 'Choose Your Action';
		els.wedges.innerHTML = ACTIONS.map((action) => wedgeMarkup(action, state, me)).join('');

		const wedgeEls = Array.from(els.wedges.querySelectorAll('.radial-wedge'));
		layoutWedges(els.wedges, wedgeEls);
		wedgeEls.forEach((el) => {
			el.addEventListener('click', () => handleChoose(el.dataset.action, state));
		});

		els.menu.classList.remove('hidden');
		if (!isOpen) {
			unbindKeys = bindRadialKeys(els.wedges);
		}
		isOpen = true;
	}

	function close() {
		if (!isOpen) return;
		els.menu.classList.add('hidden');
		els.wedges.innerHTML = '';
		unbindKeys?.();
		unbindKeys = null;
		isOpen = false;
	}

	function wedgeMarkup(action, state, me) {
		const claim = ACTION_CLAIMS[action] || null;
		const affordable = isAffordable(action, me, state);
		const reason = affordable ? '' : disabledReason(action, me, state);
		const owned = claim ? (state.yourHand || []).includes(claim) : null;
		const art = claim
			? `<img class="radial-wedge-art" src="${escapeAttr(cardArtUrl(claim))}" alt="" aria-hidden="true">`
			: '';
		const icon = ACTION_ICONS[action]
			? `<img class="radial-wedge-icon radial-wedge-icon-img" src="/static/assets/img/game/action-icons/${escapeAttr(ACTION_ICONS[action])}" alt="" aria-hidden="true">`
			: '';

		const badge = claim
			? `<span class="radial-wedge-badge${owned ? ' is-owned' : ''}" aria-hidden="true">${owned ? '✓' : '?'}</span>`
			: '';

		// Disabled always wins (the player needs to know why they can't
		// click it more than what it does); otherwise show what the action
		// does, with this match's own settings filled in. This used to be
		// a second, separately-triggered tooltip from the badge's
		// owned/not-owned one below -- both could pop open at once and
		// overlap -- so now they're one tooltip, stacked as two lines.
		const lines = [escapeHtml(reason || actionDescription(action, state.settings))];
		if (claim) {
			lines.push(
				owned
					? `You have the ${escapeHtml(claim)}.`
					: `You <strong>don't</strong> have the ${escapeHtml(claim)}.`
			);
		}
		const tooltip = `<span class="radial-tooltip">${lines.map((l) => `<span class="radial-tooltip-line">${l}</span>`).join('')}</span>`;

		return `
			<div class="radial-wedge-slot">
				<button
					type="button"
					class="radial-wedge${affordable ? '' : ' is-disabled'}"
					data-action="${escapeAttr(action)}"
					aria-disabled="${affordable ? 'false' : 'true'}"
					role="menuitem"
				>
					${art}
					${icon}
				</button>
				<div class="radial-wedge-overlay">
					<div class="radial-wedge-anchor">
						<div class="radial-wedge-content radial-tooltip-trigger" tabindex="0">
							<span class="radial-wedge-label-row">
								${badge}
								<span class="radial-wedge-label">${escapeHtml(actionLabel(action))}</span>
							</span>
							${tooltip}
						</div>
					</div>
				</div>
			</div>`;
	}

	function handleChoose(action, state) {
		const wedge = els.wedges.querySelector(`.radial-wedge[data-action="${action}"]`);
		if (wedge?.getAttribute('aria-disabled') === 'true') return;

		if (!TARGETED_ACTIONS.includes(action)) {
			submit(action, null);
			return;
		}

		const eligible = state.turnOrder.filter(
			(id) => id !== state.localPlayerId && state.players[id]?.alive
		);
		if (eligible.length <= 1) {
			// Spec §7.2: with only one possible opponent there's nothing to
			// choose between -- Target Selection is skipped and the sole
			// opponent is auto-targeted immediately.
			handleTargetSelected(action, eligible[0] ?? null, state);
			return;
		}

		awaitingTarget = true;
		close();
		TargetMenu.open(action, eligible, state);
	}

	function handleTargetSelected(action, targetPlayerId, state) {
		if (requiresDeclaredCard(action, state)) {
			awaitingTarget = true;
			close();
			DeclareCardMenu.open(action, targetPlayerId, state);
			return;
		}
		submit(action, targetPlayerId);
	}

	function submit(action, targetPlayerId, declaredCard = null) {
		awaitingTarget = true;
		close();
		GameState.chooseAction(action, targetPlayerId, declaredCard).catch((err) => {
			// Rejected (stale affordability, race with a concurrent state
			// change, ...) -- the server never advanced, so the next
			// GameState update still says it's our turn and this menu
			// reopens on its own. Nothing more to reconcile locally, per
			// the spec's server-authoritative model.
			console.warn('chosen_action rejected:', err?.detail || err);
			awaitingTarget = false;
			render(GameState.getState());
		});
	}

	function reopenAfterBack() {
		awaitingTarget = false;
		render(GameState.getState());
	}

	function requiresDeclaredCard(action, state) {
		return (
			(action === 'coup' && state.settings?.declaredCoup)
			|| (action === 'assassinate' && state.settings?.declaredAssassinate)
		);
	}

	// ---- Affordability -----------------------------------------------
	// Mirrors backend/engine/match.py's get_options() exactly, using this
	// match's own settings rather than hardcoded thresholds -- purely a
	// display computation (spec §7.1's "Disabled actions"). The server
	// re-validates independently; this never lets the client skip that.

	function isAffordable(action, me, state) {
		const settings = state.settings;
		const coins = me.coins;
		if (!settings) return false;
		if (coins >= settings.forcedCoupThreshold) return action === 'coup';
		if (action === 'coup') return coins >= settings.coupCost;
		if (action === 'assassinate') return coins >= settings.assassinateCost;
		if (action === 'steal') return hasStealableTarget(state);
		return true;
	}

	function disabledReason(action, me, state) {
		const settings = state.settings;
		const coins = me.coins;
		if (!settings) return '';
		if (coins >= settings.forcedCoupThreshold && action !== 'coup') {
			return `You have ${coins} coins — you must Coup.`;
		}
		if (action === 'coup') return `Requires ${settings.coupCost} coins.`;
		if (action === 'assassinate') return `Requires ${settings.assassinateCost} coins.`;
		if (action === 'steal') return 'No opponent has coins to extort.';
		return '';
	}

	function hasStealableTarget(state) {
		return state.turnOrder.some(
			(id) => id !== state.localPlayerId && state.players[id]?.alive && (state.players[id]?.coins ?? 0) > 0
		);
	}

	return { init };
})();

export default ActionMenu;
