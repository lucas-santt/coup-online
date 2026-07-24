import HUD from './hud.js';
import SummaryPanel from './summary-panel.js';

const Overlay = (() => {
	function init() {
		HUD.init();
		SummaryPanel.init();
	}

	return { init };
})();

export default Overlay;
