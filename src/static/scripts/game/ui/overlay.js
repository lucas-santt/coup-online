import HUD from './hud.js';
import SummaryPanel from './summary-panel.js';
import ActionMenu from './action-menu.js';
import ContestMenu from './contest-menu.js';
import CardLossMenu from './card-loss-menu.js';

const Overlay = (() => {
	function init() {
		HUD.init();
		SummaryPanel.init();
		// Target Selection (target-menu.js) is initialized by ActionMenu
		// itself -- the two are tightly coupled (spec §7.1/§7.2, one flow
		// picking action then target), so ActionMenu owns that wiring
		// rather than this module reaching into both separately.
		ActionMenu.init();
		// Contestation (spec §7.3) is independent of the above -- it opens
		// for every player who *isn't* mid-Action-Menu/Target-Selection,
		// driven entirely by GameState.phase rather than anything ActionMenu
		// tracks locally, so it owns its own subscription here.
		ContestMenu.init();
		// Card Loss picker -- independent of everything else too, driven
		// entirely by GameState.phase/turnDescription like ContestMenu.
		CardLossMenu.init();
	}

	return { init };
})();

export default Overlay;
