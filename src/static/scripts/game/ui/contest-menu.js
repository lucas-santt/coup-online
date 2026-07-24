import GameState from '../state/game-state.js';
import { escapeHtml, escapeAttr } from './dom-utils.js';
import { ACTION_CLAIMS, BLOCK_CLAIMS } from './labels.js';
import { describeDecision, headline } from './match-text.js';
import { layoutWedges, bindRadialKeys, bindTouchTooltips, bindPointerTooltips } from './radial-menu.js';

const CONTEST_ICONS = {
	pass: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5L10 17L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	challenge: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" stroke-width="2.2"/><path d="M15 15L20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 10.5H13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
	block: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 3L19 6V11.5C19 16 16.2 19.2 12 21C7.8 19.2 5 16 5 11.5V6L12 3Z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 12H15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

// Spec §7.3's table, as code: a challengeable action gets a Contest wedge
// (ACTION_CLAIMS has an entry for exactly the actions that make a
// character claim -- the same set as CHALLENGEABLE_ACTIONS server-side).
// A blockable action gets one Block wedge per legal claim (BLOCK_CLAIMS),
// shown only to whoever is actually allowed to block it -- the sole
// target for Assassinate/Extort, anyone for Foreign Aid. Coup never
// reaches this menu at all: it resolves instantly server-side and the
// phase never becomes action_declared for it.
const ContestMenu = (() => {
	let els = null;
	let isOpen = false;
	let unbindKeys = null;
	// Set the instant a wedge is clicked and cleared once the next real
	// state update lands -- guards against this menu re-opening on top of
	// itself if a subscriber fires again before the server's response to
	// our own pass/block/challenge has arrived (see action-menu.js's
	// awaitingTarget for the same shape of guard).
	let awaitingResponse = false;

	function init() {
		els = {
			menu: document.getElementById('contest-menu'),
			wedges: document.getElementById('contest-menu-wedges'),
			hint: document.getElementById('contest-menu-hint'),
		};
		els.menu.classList.toggle('is-touch', window.matchMedia('(hover: none)').matches);
		bindTouchTooltips(els.menu);
		bindPointerTooltips(els.menu);
		GameState.subscribe(render);
	}

	function render(state) {
		const decision = describeDecision(state);
		const need = whatIOwe(decision, state);
		if (!need) {
			awaitingResponse = false;
			close();
			return;
		}
		if (awaitingResponse) return;
		open(need, decision, state);
	}

	// Figures out whether the local player currently owes a contestation
	// response, and if so, what kind. Returns null for: not applicable,
	// already responded (per turn_description's own passed-lists -- so a
	// reconnect mid-window still shows the right thing, same as every
	// other piece of state here), or it's the actor's/blocker's own claim.
	function whatIOwe(decision, state) {
		const me = state.localPlayerId;
		if (!state.players[me]?.alive) return null;
		const td = state.turnDescription;

		if (decision.kind === 'pending-claim') {
			if (decision.actorId === me) return null;
			if ((td?.playersPassedAction || []).includes(me)) return null;
			return { kind: 'action', action: decision.action, targetId: decision.targetId };
		}
		if (decision.kind === 'pending-block') {
			if (decision.blockerId === me) return null;
			if ((td?.playersPassedBlock || []).includes(me)) return null;
			return { kind: 'block' };
		}
		return null;
	}

	function open(need, decision, state) {
		els.hint.textContent = headline(decision, state.players, state.localPlayerId);
		els.wedges.innerHTML = wedgeList(need, state).map(wedgeMarkup).join('');

		const wedgeEls = Array.from(els.wedges.querySelectorAll('.radial-wedge'));
		layoutWedges(els.wedges, wedgeEls);
		wedgeEls.forEach((el) => {
			el.addEventListener('click', () => handleChoose(el.dataset.choice));
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

	function wedgeList(need, state) {
		// BLOCK_DECLARED: process_event_while_block_declared only ever
		// accepts PASS or CHALLENGE (no blocking a block) -- see match.py.
		if (need.kind === 'block') {
			return [
				{ choice: 'pass', label: 'Pass' },
				{ choice: 'challenge', label: 'Contest' },
			];
		}

		const wedges = [{ choice: 'pass', label: 'Pass' }];
		if (ACTION_CLAIMS[need.action]) {
			wedges.push({ choice: 'challenge', label: 'Contest' });
		}
		const blockClaims = BLOCK_CLAIMS[need.action];
		if (blockClaims) {
			// Foreign Aid has no target (need.targetId is null) so anyone
			// blockable-eligible may claim Duke; Assassinate/Extort are
			// target-only per TARGETED_BLOCK_ONLY_ACTIONS server-side.
			const canBlock = !need.targetId || need.targetId === state.localPlayerId;
			if (canBlock) {
				for (const card of blockClaims) {
					wedges.push({ choice: `block:${card}`, label: 'Block', sub: card });
				}
			}
		}
		return wedges;
	}

	function wedgeMarkup({ choice, label, sub }) {
		const iconKey = choice.startsWith('block:') ? 'block' : choice;
		return `
			<div class="radial-wedge-slot">
				<button type="button" class="radial-wedge" data-choice="${escapeAttr(choice)}" role="menuitem">
					<span class="contest-wedge-icon" aria-hidden="true">${CONTEST_ICONS[iconKey] || ''}</span>
				</button>
				<div class="radial-wedge-overlay">
					<div class="radial-wedge-anchor">
						<div class="radial-wedge-content">
							<span class="radial-wedge-label">${escapeHtml(label)}</span>
							${sub ? `<span class="contest-wedge-sub">${escapeHtml(sub)}</span>` : ''}
						</div>
					</div>
				</div>
			</div>`;
	}

	function handleChoose(choice) {
		awaitingResponse = true;
		close();

		let request;
		if (choice === 'pass') {
			request = GameState.pass();
		} else if (choice === 'challenge') {
			request = GameState.challenge();
		} else if (choice.startsWith('block:')) {
			request = GameState.block(choice.slice('block:'.length));
		} else {
			awaitingResponse = false;
			return;
		}

		request.catch((err) => {
			// Rejected (stale window, race with someone else's response
			// already resolving it, ...) -- the server never advanced, so
			// the next GameState update reflects reality and render()
			// reopens this menu on its own if there's still something to
			// decide. Nothing more to reconcile locally, per the spec's
			// server-authoritative model.
			console.warn('contestation response rejected:', err?.detail || err);
			awaitingResponse = false;
			render(GameState.getState());
		});
	}

	return { init };
})();

export default ContestMenu;
