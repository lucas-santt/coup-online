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

	const overlayHeight = overlayScroll.offsetHeight;
	const screenHeight = window.innerHeight;

	let currentMode = 'login'; // 'login' | 'signup'
	let context = 'gate';
	let onDone = null;

	// Pins the box's current top edge in place
	function pinTop() {
		const marginTop = (screenHeight - overlayHeight) * 0.5 - overlayHeight * 0.07;
		overlayScroll.style.marginTop = `${marginTop}px`;
		overlay.classList.add('pinned-top');
	}

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
	btnGuest.addEventListener('click', () => {
		console.log(`Guest Auth Requested: POST ${LOBBY_SETTINGS.endpoints.auth.guest}`);
		Toast.show('Welcome, Traveller! Entering the court as Guest...', 'success');
		resolve({ authenticated: true, isGuest: true, username: 'Guest' });
	});

	// Login / Signup submit
	authForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const username = document.getElementById('auth-username').value.trim();
		const password = document.getElementById('auth-password').value;

		if (!username || !password) {
			Toast.show('Moniker and passphrase must not be blank!', 'warning');
			return;
		}

		if (currentMode === 'login') {
			console.log(`Log In Requested: POST ${LOBBY_SETTINGS.endpoints.auth.login} | Username: "${username}"`);
			Toast.show(`Verifying credentials for "${username}"...`, 'info');

			setTimeout(() => {
				Toast.show('Access granted! Entering the realm...', 'success');
				resolve({ authenticated: true, isGuest: false, username });
			}, 1200);
		} else {
			const confirmPassword = confirmPasswordInput.value;
			if (password !== confirmPassword) {
				Toast.show('Verily, thy passphrases do not match!', 'warning');
				confirmPasswordInput.focus();
				return;
			}

			console.log(`Sign Up Requested: POST ${LOBBY_SETTINGS.endpoints.auth.signup} | Username: "${username}"`);
			Toast.show(`Pledging allegiance for "${username}"...`, 'info');

			setTimeout(() => {
				Toast.show('Allegiance sworn! Logging you in...', 'success');
				resolve({ authenticated: true, isGuest: false, username });
			}, 1200);
		}
	});

	return { open };
})();