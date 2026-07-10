const Toast = (() => {
	const container = document.getElementById('toast-container');

	function show(message, type = 'info') {
		const toast = document.createElement('div');
		toast.className = `medieval-toast toast-${type}`;

		const icon = LOBBY_SETTINGS.toast.icons[type] || LOBBY_SETTINGS.toast.icons.info;

		toast.innerHTML = `
			<span class="toast-icon">${icon}</span>
			<span class="toast-message">${message}</span>
		`;

		toast.addEventListener('click', () => dismiss(toast));
		container.appendChild(toast);

		setTimeout(() => dismiss(toast), LOBBY_SETTINGS.toast.autoDismissMs);
	}

	function dismiss(toast) {
		if (!toast.classList.contains('toast-exit')) {
			toast.classList.add('toast-exit');
			toast.addEventListener('animationend', () => toast.remove(), { once: true });
		}
	}

	return { show };
})();