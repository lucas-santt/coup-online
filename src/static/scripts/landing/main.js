document.addEventListener('DOMContentLoaded', () => {
	// DOM Elements
	const tabLogin = document.getElementById('tab-login');
	const tabSignup = document.getElementById('tab-signup');
	const authForm = document.getElementById('auth-form');
	const confirmPasswordGroup = document.getElementById('confirm-password-group');
	const confirmPasswordInput = document.getElementById('auth-confirm-password');
	const btnSubmit = document.getElementById('btn-submit');
	const pageContainer = document.querySelector('.page-container');

	const btnTextLogin = btnSubmit.querySelector('.btn-text-login');
	const btnTextSignup = btnSubmit.querySelector('.btn-text-signup');

	const linkToggleAuth = document.getElementById('link-toggle-auth');
	const toggleHintText = document.getElementById('toggle-hint-text');
	const btnGuest = document.getElementById('btn-guest');
	const toastContainer = document.getElementById('toast-container');

	// Music controls
	const bgMusic = document.getElementById('bg-music');
	const btnMusicToggle = document.getElementById('btn-music-toggle');
	const musicIcon = document.getElementById('music-icon');
	const volumeSlider = document.getElementById('volume-slider');

	// =============================================
	//  Pin vertical position
	//
	//  The signup form is taller than login (extra confirm-password
	//  field). Centering both with flexbox means the box recenters,
	//  and its top edge visibly jumps, every time you switch modes.
	//  Instead we compute where the box would sit if centered in its
	//  login-sized state, and fix that as a literal top offset. Growth
	//  from there just extends the box downward.
	// =============================================
	function getLoginHeight() {
		const containerHeight = pageContainer.offsetHeight;

		if (!confirmPasswordGroup.classList.contains('visible')) {
			return containerHeight;
		}

		// Currently in signup mode: subtract what the confirm-password
		// field is contributing to get the height login mode would have.
		const wrapperHeight = confirmPasswordGroup.scrollHeight;
		const wrapperMarginTop = parseFloat(getComputedStyle(confirmPasswordGroup).marginTop) || 0;
		return containerHeight - wrapperHeight - wrapperMarginTop;
	}

	function pinPageContainerTop() {
		const loginHeight = getLoginHeight();
		const viewportMargin = 20; // never pin closer than this to the top edge
		const top = Math.max(viewportMargin, (window.innerHeight - loginHeight) / 3);

		pageContainer.style.top = `${top}px`;
		pageContainer.style.transform = 'translateX(-50%)';
	}

	pinPageContainerTop();
	window.addEventListener('resize', pinPageContainerTop);

	// =============================================
	//  Music Setup & Smooth Focus/Blur Fading
	// =============================================
	const DEFAULT_VOLUME = 0.15;
	let isMuted = false;
	let currentSliderVal = DEFAULT_VOLUME;
	let fadeInterval = null;

	bgMusic.volume = DEFAULT_VOLUME;

	// Browsers require a user interaction before autoplay
	function tryStartMusic() {
		if (bgMusic.paused && !isMuted) {
			bgMusic.play().catch(() => {});
		}
		document.removeEventListener('click', tryStartMusic);
		document.removeEventListener('keydown', tryStartMusic);
	}
	document.addEventListener('click', tryStartMusic);
	document.addEventListener('keydown', tryStartMusic);

	btnMusicToggle.addEventListener('click', (e) => {
		e.stopPropagation();
		if (isMuted || bgMusic.paused) {
			bgMusic.play();
			isMuted = false;
			musicIcon.classList.remove('muted');
			btnMusicToggle.setAttribute('aria-label', 'Mute music');
			bgMusic.volume = currentSliderVal;
		} else {
			bgMusic.pause();
			isMuted = true;
			musicIcon.classList.add('muted');
			btnMusicToggle.setAttribute('aria-label', 'Play music');
		}
	});

	// Update volume slider fill and audio volume
	function updateVolume() {
		const val = volumeSlider.value;
		currentSliderVal = val / 100;
		volumeSlider.style.setProperty('--fill', val + '%');

		if (!isMuted && !bgMusic.paused) {
			bgMusic.volume = currentSliderVal;
		}

		if (val == 0) {
			isMuted = true;
			musicIcon.classList.add('muted');
		} else {
			if (isMuted) {
				isMuted = false;
				musicIcon.classList.remove('muted');
				if (bgMusic.paused) bgMusic.play().catch(() => {});
			}
		}
	}
	volumeSlider.style.setProperty('--fill', DEFAULT_VOLUME * 100 + '%');
	volumeSlider.addEventListener('input', updateVolume);

	// Smooth focus/blur volume transitions
	function fadeVolumeTo(targetVolume, duration = 400) {
		if (isMuted || bgMusic.paused) return;

		clearInterval(fadeInterval);
		const startVolume = bgMusic.volume;
		const steps = 20;
		const stepTime = duration / steps;
		const volumeDelta = (targetVolume - startVolume) / steps;
		let currentStep = 0;

		fadeInterval = setInterval(() => {
			currentStep++;
			bgMusic.volume = Math.max(0, Math.min(currentSliderVal, startVolume + volumeDelta * currentStep));
			if (currentStep >= steps) {
				clearInterval(fadeInterval);
				bgMusic.volume = targetVolume;
			}
		}, stepTime);
	}

	window.addEventListener('blur', () => {
		// Lower volume significantly when tab loses focus
		fadeVolumeTo(currentSliderVal * 0.2, 200);
	});

	window.addEventListener('focus', () => {
		// Restore volume when focus returns
		fadeVolumeTo(currentSliderVal, 200);
	});

	// =============================================
	//  Tab Switching / Form Transitions
	// =============================================
	let currentMode = 'login'; // 'login' or 'signup'

	function setMode(mode) {
		if (currentMode === mode) return;
		currentMode = mode;

		if (mode === 'login') {
			tabLogin.classList.add('active');
			tabLogin.setAttribute('aria-selected', 'true');
			tabSignup.classList.remove('active');
			tabSignup.setAttribute('aria-selected', 'false');

			// Hide confirm password wrapper and disable required attribute
			confirmPasswordGroup.classList.remove('visible');
			confirmPasswordInput.removeAttribute('required');

			// Crossfade Button Text
			btnTextSignup.classList.remove('active');
			btnTextLogin.classList.add('active');

			toggleHintText.innerHTML = `Don't have an account? <a href="#" id="link-toggle-auth-inner" class="renaissance-link">Sign up</a>`;
			document.getElementById('link-toggle-auth-inner').addEventListener('click', (e) => {
				e.preventDefault();
				setMode('signup');
			});
		} else {
			tabSignup.classList.add('active');
			tabSignup.setAttribute('aria-selected', 'true');
			tabLogin.classList.remove('active');
			tabLogin.setAttribute('aria-selected', 'false');

			// Show confirm password wrapper and enable required attribute
			confirmPasswordGroup.classList.add('visible');
			confirmPasswordInput.setAttribute('required', 'required');

			// Crossfade Button Text
			btnTextLogin.classList.remove('active');
			btnTextSignup.classList.add('active');

			toggleHintText.innerHTML = `Already have an account? <a href="#" id="link-toggle-auth-inner" class="renaissance-link">Log in</a>`;
			document.getElementById('link-toggle-auth-inner').addEventListener('click', (e) => {
				e.preventDefault();
				setMode('login');
			});
		}
	}

	tabLogin.addEventListener('click', () => setMode('login'));
	tabSignup.addEventListener('click', () => setMode('signup'));

	if (linkToggleAuth) {
		linkToggleAuth.addEventListener('click', (e) => {
			e.preventDefault();
			setMode('signup');
		});
	}

	// =============================================
	//  Toast Notification System
	// =============================================
	function showToast(message, type = 'info') {
		const toast = document.createElement('div');
		toast.className = `medieval-toast toast-${type}`;

		const icons = { info: '📜', success: '👑', warning: '⚔️', error: '🛡️' };
		const icon = icons[type] || icons.info;

		toast.innerHTML = `
			<span class="toast-icon">${icon}</span>
			<span class="toast-message">${message}</span>
		`;

		toast.addEventListener('click', () => dismissToast(toast));
		toastContainer.appendChild(toast);

		setTimeout(() => dismissToast(toast), 4500);
	}

	function dismissToast(toast) {
		if (!toast.classList.contains('toast-exit')) {
			toast.classList.add('toast-exit');
			toast.addEventListener('animationend', () => toast.remove(), { once: true });
		}
	}

	// =============================================
	//  Form Submissions
	// =============================================

	// Guest
	btnGuest.addEventListener('click', () => {
		console.log('Guest Auth Requested: POST /api/auth/guest');
		showToast('Welcome, Traveller! Entering the court as Guest...', 'success');
	});

	// Unified Form Submit Handler
	authForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const username = document.getElementById('auth-username').value.trim();
		const password = document.getElementById('auth-password').value;

		if (!username || !password) {
			showToast('Moniker and passphrase must not be blank!', 'warning');
			return;
		}

		if (currentMode === 'login') {
			console.log(`Log In Requested: POST /api/auth/login | Username: "${username}"`);
			showToast(`Verifying credentials for "${username}"...`, 'info');

			// Placeholder — replace with real API call
			setTimeout(() => showToast('Access granted! Entering the realm...', 'success'), 1500);
		} else {
			const confirmPassword = confirmPasswordInput.value;
			if (password !== confirmPassword) {
				showToast('Verily, thy passphrases do not match!', 'warning');
				confirmPasswordInput.focus();
				return;
			}

			console.log(`Sign Up Requested: POST /api/auth/signup | Username: "${username}"`);
			showToast(`Pledging allegiance for "${username}"...`, 'info');

			// Placeholder — on success, auto-login by switching mode, pre-filling, and submitting
			setTimeout(() => {
				showToast('Allegiance sworn! Logging you in...', 'success');

				setTimeout(() => {
					setMode('login');
					document.getElementById('auth-username').value = username;
					document.getElementById('auth-password').value = password;

					// Slight delay for visibility, then auto-submit the login
					setTimeout(() => {
						authForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
					}, 600);
				}, 1000);
			}, 1500);
		}
	});
});