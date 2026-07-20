// Reusable login/signup overlay.
//
// Two contexts:
//   'gate'    - blocking, shown on first load with no session. Guest
//               option is visible. Can't be dismissed without picking
//               something.
//   'convert' - a guest asking to secure their progress with a real
//               account. Guest option is hidden (they're already a
//               guest); clicking outside the box cancels back into
//               the lobby.
//
// Usage: AuthOverlay.open({ context: 'gate', onDone: (result) => {...} })
// result is one of:
//   { authenticated: true,  isGuest: false, username }
//   { authenticated: true,  isGuest: true,  username }
//   { authenticated: false }   // only possible from 'convert', via outside click

const AuthOverlay = (() => {
	const overlay = document.getElementById('auth-overlay');
	const overlayScroll = document.getElementById('auth-overlay-scroll');
	const overlayTitle = document.getElementById('overlay-title');
	const overlaySubtitle = document.getElementById('overlay-subtitle');
	const guestSection = document.getElementById('overlay-guest-section');

	const tabLogin = document.getElementById('tab-login');
	const tabSignup = document.getElementById('tab-signup');
	const authForm = document.getElementById('auth-form');
	const confirmPasswordGroup = document.getElementById('confirm-password-group');
	const confirmPasswordInput = document.getElementById('auth-confirm-password');
	const btnSubmit = document.getElementById('btn-submit');
	const btnTextLogin = btnSubmit.querySelector('.btn-text-login');
	const btnTextSignup = btnSubmit.querySelector('.btn-text-signup');
	const linkToggleAuth = document.getElementById('link-toggle-auth');
	const toggleHintText = document.getElementById('toggle-hint-text');
	const btnGuest = document.getElementById('btn-guest');
	const usernameInput = document.getElementById('auth-username');
	const passwordInput = document.getElementById('auth-password');

	usernameInput.maxLength = LOBBY_SETTINGS.auth.usernameMaxLength;
	passwordInput.maxLength = LOBBY_SETTINGS.auth.passwordMaxLength;
	confirmPasswordInput.maxLength = LOBBY_SETTINGS.auth.passwordMaxLength;

	let currentMode = 'login'; // 'login' | 'signup'
	let context = 'gate';
	let onDone = null;

	// Pins the box's current top edge in place. Reads sizes fresh each call
	// so it stays correct after the window (or the box itself) changes size.
	function pinTop() {
		const overlayHeight = overlayScroll.offsetHeight;
		const screenHeight = window.innerHeight;
		const marginTop = (screenHeight - overlayHeight) * 0.5 - overlayHeight * 0.07;
		overlayScroll.style.marginTop = `${marginTop}px`;
		overlay.classList.add('pinned-top');
	}

	// Re-pin on resize, but only while the overlay is actually showing —
	// no point recalculating a hidden element's layout.
	window.addEventListener('resize', () => {
		if (overlay.classList.contains('visible')) pinTop();
	});

	function setAuthMode(mode) {
		if (currentMode === mode) return;
		currentMode = mode;

		if (mode === 'login') {
			tabLogin.classList.add('active');
			tabLogin.setAttribute('aria-selected', 'true');
			tabSignup.classList.remove('active');
			tabSignup.setAttribute('aria-selected', 'false');

			confirmPasswordGroup.classList.remove('visible');
			confirmPasswordInput.removeAttribute('required');

			btnTextSignup.classList.remove('active');
			btnTextLogin.classList.add('active');

			toggleHintText.innerHTML = `Don't have an account? <a href="#" id="link-toggle-auth-inner" class="renaissance-link">Sign up</a>`;
		} else {
			tabSignup.classList.add('active');
			tabSignup.setAttribute('aria-selected', 'true');
			tabLogin.classList.remove('active');
			tabLogin.setAttribute('aria-selected', 'false');

			// Pin the top edge before the box grows taller, so it just
			// extends downward instead of re-centering.
			pinTop();
			confirmPasswordGroup.classList.add('visible');
			confirmPasswordInput.setAttribute('required', 'required');

			btnTextLogin.classList.remove('active');
			btnTextSignup.classList.add('active');

			toggleHintText.innerHTML = `Already have an account? <a href="#" id="link-toggle-auth-inner" class="renaissance-link">Log in</a>`;
		}

		document.getElementById('link-toggle-auth-inner').addEventListener('click', (e) => {
			e.preventDefault();
			setAuthMode(currentMode === 'login' ? 'signup' : 'login');
		});
	}

	function resolve(result) {
		overlay.classList.remove('visible');
		overlay.setAttribute('aria-hidden', 'true');
		authForm.reset();
		const callback = onDone;
		onDone = null;
		if (callback) callback(result);
		setAuthMode('login');
	}

	function open({ context: ctx = 'gate', onDone: callback = null } = {}) {
		context = ctx;
		onDone = callback;

		if (context === 'convert') {
			overlayTitle.textContent = 'Secure Your Progress';
			overlaySubtitle.textContent = 'Create an account to keep this character between sessions.';
			guestSection.classList.add('hidden');
		} else {
			overlayTitle.textContent = 'Enter the Court';
			overlaySubtitle.textContent = 'Log in, sign up, or slip in as a guest.';
			guestSection.classList.remove('hidden');
		}

		pinTop();

		overlay.classList.add('visible');
		overlay.setAttribute('aria-hidden', 'false');
	}

	// Tabs
	tabLogin.addEventListener('click', () => setAuthMode('login'));
	tabSignup.addEventListener('click', () => setAuthMode('signup'));
	if (linkToggleAuth) {
		linkToggleAuth.addEventListener('click', (e) => {
			e.preventDefault();
			setAuthMode('signup');
		});
	}

	// Click outside the scroll box dismisses it, but only in 'convert'
	// context — the first-load gate has no session yet, so it must
	// stay modal until the person picks login/signup/guest.
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay && context === 'convert') {
			resolve({ authenticated: false });
		}
	});

	// Guest
	btnGuest.addEventListener('click', async () => {
		btnGuest.disabled = true;

		try {
			const res = await fetch(LOBBY_SETTINGS.endpoints.auth.guest, {
				method: 'POST',
				credentials: 'same-origin',
			});

			if (!res.ok) {
				Toast.show(await ToastMessages.fromResponse(res), 'error');
				return;
			}

			const data = await res.json();
			Toast.show(ToastMessages.auth.guestGranted(), 'success');
			resolve({ authenticated: true, isGuest: true, username: data.username });
		} catch (err) {
			Toast.show(ToastMessages.connectionLost(), 'network');
		} finally {
			btnGuest.disabled = false;
		}
	});

	// Login / Signup submit
	authForm.addEventListener('submit', async (e) => {
		e.preventDefault();

		const username = document.getElementById('auth-username').value.trim();
		const password = document.getElementById('auth-password').value;

		if (!username || !password) {
			Toast.show(ToastMessages.auth.missingFields(), 'warning');
			return;
		}

		btnSubmit.disabled = true;

		if (currentMode === 'login') {
			Toast.show(ToastMessages.auth.verifying(username), 'info');

			try {
				const res = await fetch(LOBBY_SETTINGS.endpoints.auth.login, {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username, password }),
				});

				if (!res.ok) {
					Toast.show(await ToastMessages.fromResponse(res), 'warning');
					return;
				}

				Toast.show(ToastMessages.auth.loginSuccess(), 'success');
				resolve({ authenticated: true, isGuest: false, username });
			} catch (err) {
				Toast.show(ToastMessages.connectionLost(), 'network');
			} finally {
				btnSubmit.disabled = false;
			}
		} else {
			const confirmPassword = confirmPasswordInput.value;
			if (password !== confirmPassword) {
				Toast.show(ToastMessages.auth.passwordsMismatch(), 'warning');
				confirmPasswordInput.focus();
				btnSubmit.disabled = false;
				return;
			}

			Toast.show(ToastMessages.auth.filing(username), 'info');

			try {
				const res = await fetch(LOBBY_SETTINGS.endpoints.auth.signup, {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						username,
						password,
						password_confirmation: confirmPassword,
					}),
				});

				if (!res.ok) {
					Toast.show(await ToastMessages.fromResponse(res), 'warning');
					return;
				}

				Toast.show(ToastMessages.auth.signupSuccess(), 'success');
				resolve({ authenticated: true, isGuest: false, username });
			} catch (err) {
				Toast.show(ToastMessages.connectionLost(), 'network');
			} finally {
				btnSubmit.disabled = false;
			}
		}
	});

	return { open };
})();