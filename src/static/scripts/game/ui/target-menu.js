import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr, avatarSrc } from './dom-utils.js';
import { actionLabel } from './labels.js';
import { layoutWedges, bindRadialKeys, bindTouchTooltips } from './radial-menu.js';

// Only Steal cares about a target's coin count (spec doesn't call this
// out explicitly, but it mirrors the Action Menu's own "grey it out and
// say why" treatment of unaffordable actions, and the server would
// reject it anyway -- see engine/match.py's steal_coins guard).
function stealBlocked(action, targetId, state) {
	return action === 'steal' && (state.players[targetId]?.coins ?? 0) === 0;
}

const TargetMenu = (() => {
	let els = null;
	let onBack = null;
	let onChooseTarget = null;
	let unbindKeys = null;
	let currentAction = null;

	function init(options) {
		onBack = options.onBack;
		onChooseTarget = options.onChooseTarget;
		els = {
			menu: document.getElementById('target-menu'),
			wedges: document.getElementById('target-menu-wedges'),
			hint: document.getElementById('target-menu-hint'),
			backBtn: document.getElementById('target-menu-back'),
		};
		els.menu.classList.toggle('is-touch', window.matchMedia('(hover: none)').matches);
		bindTouchTooltips(els.menu);
		els.backBtn.addEventListener('click', back);
	}

	function open(action, targetIds, state) {
		currentAction = action;
		els.hint.textContent = `Choose a target for ${actionLabel(action)}`;
		els.wedges.innerHTML = targetIds.map((id) => wedgeMarkup(id, action, state)).join('');

		const wedgeEls = Array.from(els.wedges.querySelectorAll('.radial-wedge'));
		layoutWedges(els.wedges, wedgeEls);
		wedgeEls.forEach((el) => {
			el.addEventListener('click', () => handleChoose(el.dataset.targetId));
		});
		els.wedges.querySelectorAll('.radial-wedge-content[data-target-id]').forEach((el) => {
			el.addEventListener('click', () => handleChoose(el.dataset.targetId));
		});

		els.menu.classList.remove('hidden');
		unbindKeys = bindRadialKeys(els.wedges, { onEscape: back });
	}

	function close() {
		els.menu.classList.add('hidden');
		els.wedges.innerHTML = '';
		unbindKeys?.();
		unbindKeys = null;
	}

	function wedgeMarkup(targetId, action, state) {
		const player = state.players[targetId];
		const blocked = stealBlocked(action, targetId, state);
		const tooltip = blocked
			? '<span class="radial-tooltip"><span class="radial-tooltip-line">No coins to steal.</span></span>'
			: '';

		return `
			<div class="radial-wedge-slot">
				<button
					type="button"
					class="radial-wedge${blocked ? ' is-disabled' : ''}"
					data-target-id="${escapeAttr(targetId)}"
					aria-disabled="${blocked ? 'true' : 'false'}"
					role="menuitem"
				>
					<img class="radial-wedge-art radial-wedge-avatar" src="${escapeAttr(avatarSrc(player?.avatarUrl))}" alt="">
				</button>
				<div class="radial-wedge-overlay">
					<div class="radial-wedge-anchor">
						<div class="radial-wedge-content${blocked ? ' radial-tooltip-trigger' : ''}" data-target-id="${escapeAttr(targetId)}" tabindex="${blocked ? '0' : '-1'}">
							<span class="radial-wedge-label">${escapeHtml(player?.displayName || '')}</span>
							${tooltip}
						</div>
					</div>
				</div>
			</div>`;
	}

	function handleChoose(targetId) {
		const wedge = els.wedges.querySelector(`.radial-wedge[data-target-id="${targetId}"]`);
		if (wedge?.getAttribute('aria-disabled') === 'true') return;

		const action = currentAction;
		close();
		if (onChooseTarget) {
			onChooseTarget(action, targetId, GameState.getState());
			return;
		}
		GameState.chooseAction(action, targetId).catch((err) => {
			// Rejected -- bounce back to the Action Menu rather than
			// leaving the player stuck on a dead-end screen. See
			// action-menu.js's submit() for the equivalent untargeted
			// case; the server is still the one that decided nothing
			// advanced, per the spec's server-authoritative model.
			console.warn('chosen_action (targeted) rejected:', err?.detail || err);
			onBack?.();
		});
	}

	function back() {
		close();
		onBack?.();
	}

	return { init, open, close };
})();

export default TargetMenu;
