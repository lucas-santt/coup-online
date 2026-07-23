const Toast = (() => {
	const container = document.getElementById('toast-container');
	/** @type {Map<string, { el: HTMLElement, timer: ReturnType<typeof setTimeout> | null, onDismiss: Function | null }>} */
	const byKey = new Map();
	/** @type {WeakMap<HTMLElement, ReturnType<typeof setTimeout>>} */
	const anonTimers = new WeakMap();

	function show(message, type = 'info', opts = {}) {
		const key = (opts && opts.key) || null;

		if (key) {
			// Always strip every existing toast with this key first, then either
			// revive the tracked one or create a single replacement.
			const tracked = byKey.get(key);
			const survivors = [];
			container.querySelectorAll(`.medieval-toast[data-toast-key="${key}"]`).forEach((el) => {
				survivors.push(el);
			});

			let keep = null;
			if (tracked?.el?.isConnected && !tracked.el.classList.contains('toast-exit')) {
				keep = tracked.el;
			} else if (survivors.length) {
				keep = survivors.find((el) => !el.classList.contains('toast-exit')) || null;
			}

			survivors.forEach((el) => {
				if (el !== keep) el.remove();
			});

			if (keep) {
				const msgEl = keep.querySelector('.toast-message');
				if (msgEl) msgEl.textContent = message;
				byKey.set(key, {
					el: keep,
					timer: tracked?.timer ?? null,
					onDismiss: typeof opts.onDismiss === 'function' ? opts.onDismiss : (tracked?.onDismiss ?? null),
				});
				restartKeyedTimer(key);
				return keep;
			}

			byKey.delete(key);
		}

		const toast = document.createElement('div');
		toast.className = `medieval-toast toast-${type}`;
		if (key) toast.setAttribute('data-toast-key', key);

		const icon = LOBBY_SETTINGS.toast.icons[type] || LOBBY_SETTINGS.toast.icons.info;
		const msgSpan = document.createElement('span');
		msgSpan.className = 'toast-message';
		msgSpan.textContent = message;

		const iconSpan = document.createElement('span');
		iconSpan.className = 'toast-icon';
		iconSpan.innerHTML = icon;

		toast.appendChild(iconSpan);
		toast.appendChild(msgSpan);
		toast.addEventListener('click', () => dismiss(toast));
		container.appendChild(toast);

		if (key) {
			byKey.set(key, {
				el: toast,
				timer: null,
				onDismiss: typeof opts.onDismiss === 'function' ? opts.onDismiss : null,
			});
			restartKeyedTimer(key);
		} else {
			const timer = setTimeout(() => dismiss(toast), LOBBY_SETTINGS.toast.autoDismissMs);
			anonTimers.set(toast, timer);
		}

		return toast;
	}

	function restartProgressBar(toast) {
		toast.classList.remove('toast-progress-paused');
		void toast.offsetWidth;
		toast.classList.add('toast-progress-paused');
		void toast.offsetWidth;
		toast.classList.remove('toast-progress-paused');
	}

	function restartKeyedTimer(key) {
		const active = byKey.get(key);
		if (!active) return;
		if (active.timer) clearTimeout(active.timer);
		restartProgressBar(active.el);
		active.timer = setTimeout(() => dismiss(active.el), LOBBY_SETTINGS.toast.autoDismissMs);
	}

	function dismiss(toast) {
		if (!toast || !toast.isConnected || toast.classList.contains('toast-exit')) return;

		const key = toast.getAttribute('data-toast-key');
		let onDismiss = null;

		if (key && byKey.has(key)) {
			const active = byKey.get(key);
			if (active.el === toast) {
				if (active.timer) clearTimeout(active.timer);
				onDismiss = active.onDismiss;
				byKey.delete(key);
			}
		} else {
			const t = anonTimers.get(toast);
			if (t) clearTimeout(t);
			anonTimers.delete(toast);
		}

		if (typeof onDismiss === 'function') {
			try { onDismiss(); } catch (_) { /* ignore */ }
		}

		toast.classList.add('toast-exit');
		const remove = () => { if (toast.isConnected) toast.remove(); };
		toast.addEventListener('animationend', remove, { once: true });
		setTimeout(remove, 400);
	}

	return { show, dismiss };
})();
