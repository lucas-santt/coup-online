// Rules reference overlay. Non-blocking (click outside or the × closes it),
// opened from the Rules tab's two buttons, each jumping straight to a tab.
const RulesOverlay = (() => {
	const overlay = document.getElementById('rules-overlay');
	const btnClose = document.getElementById('btn-rules-close');
	const tabs = document.querySelectorAll('#rules-overlay [data-rules-tab]');

	function setTab(name) {
		tabs.forEach((tab) => {
			const isActive = tab.dataset.rulesTab === name;
			tab.classList.toggle('active', isActive);
			tab.setAttribute('aria-selected', String(isActive));
		});
		document.getElementById('rules-content-base').classList.toggle('hidden', name !== 'base');
		document.getElementById('rules-content-reformation').classList.toggle('hidden', name !== 'reformation');
	}

	function open(tabName = 'base') {
		setTab(tabName);
		overlay.classList.add('visible');
		overlay.setAttribute('aria-hidden', 'false');
	}

	function close() {
		overlay.classList.remove('visible');
		if (overlay.contains(document.activeElement)) {
			document.activeElement.blur();
		}
		overlay.setAttribute('aria-hidden', 'true');
	}

	tabs.forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.rulesTab)));
	btnClose.addEventListener('click', close);
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && overlay.classList.contains('visible')) close();
	});

	document.querySelectorAll('.rules-open-btn').forEach((btn) => {
		btn.addEventListener('click', () => open(btn.dataset.rulesTab));
	});

	return { open, close };
})();