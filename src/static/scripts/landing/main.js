document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const panelLogin = document.getElementById('panel-login');
    const panelSignup = document.getElementById('panel-signup');
    const linkToggleAuth = document.getElementById('link-toggle-auth');
    const toggleHintText = document.getElementById('toggle-hint-text');
    const btnGuest = document.getElementById('btn-guest');
    const toastContainer = document.getElementById('toast-container');
    const sealLogo = document.getElementById('seal-logo');

    // Music controls
    const bgMusic = document.getElementById('bg-music');
    const btnMusicToggle = document.getElementById('btn-music-toggle');
    const musicIcon = document.getElementById('music-icon');
    const volumeSlider = document.getElementById('volume-slider');

    // =============================================
    //  Music Setup
    // =============================================
    const DEFAULT_VOLUME = 0.15;
    let isMuted = false;

    bgMusic.volume = DEFAULT_VOLUME;

    // Browsers require a user interaction before autoplay; start on first click/keydown
    function tryStartMusic() {
        if (bgMusic.paused) {
            bgMusic.play().catch(() => { /* autoplay blocked, user will use the button */ });
        }
        document.removeEventListener('click', tryStartMusic);
        document.removeEventListener('keydown', tryStartMusic);
    }
    document.addEventListener('click', tryStartMusic);
    document.addEventListener('keydown', tryStartMusic);

    btnMusicToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't re-trigger tryStartMusic
        if (isMuted || bgMusic.paused) {
            bgMusic.play();
            isMuted = false;
            musicIcon.innerHTML = '&#9835;';
            btnMusicToggle.classList.remove('muted');
            btnMusicToggle.setAttribute('aria-label', 'Mute music');
        } else {
            bgMusic.pause();
            isMuted = true;
            musicIcon.innerHTML = '&#128263;';
            btnMusicToggle.classList.add('muted');
            btnMusicToggle.setAttribute('aria-label', 'Play music');
        }
    });

    // Update volume slider fill and audio volume
    function updateVolume() {
        const val = volumeSlider.value;
        bgMusic.volume = val / 100;
        volumeSlider.style.setProperty('--fill', val + '%');
        if (val == 0) {
            musicIcon.innerHTML = '&#128263;';
            isMuted = true;
        } else {
            musicIcon.innerHTML = '&#9835;';
            isMuted = false;
            btnMusicToggle.classList.remove('muted');
        }
    }
    // Set initial fill
    volumeSlider.style.setProperty('--fill', DEFAULT_VOLUME * 100 + '%');
    volumeSlider.addEventListener('input', updateVolume);

    // =============================================
    //  Tab Switching
    // =============================================
    function switchTab(target) {
        if (target === 'login') {
            tabLogin.classList.add('active');
            tabLogin.setAttribute('aria-selected', 'true');
            tabSignup.classList.remove('active');
            tabSignup.setAttribute('aria-selected', 'false');

            panelLogin.style.display = 'flex';
            panelLogin.classList.add('active');
            panelSignup.style.display = 'none';
            panelSignup.classList.remove('active');

            toggleHintText.innerHTML = `Don't have an account? <a href="#" id="link-toggle-auth-inner" class="renaissance-link">Sign up</a>`;
            document.getElementById('link-toggle-auth-inner').addEventListener('click', (e) => {
                e.preventDefault();
                switchTab('signup');
            });
        } else if (target === 'signup') {
            tabSignup.classList.add('active');
            tabSignup.setAttribute('aria-selected', 'true');
            tabLogin.classList.remove('active');
            tabLogin.setAttribute('aria-selected', 'false');

            panelSignup.style.display = 'flex';
            panelSignup.classList.add('active');
            panelLogin.style.display = 'none';
            panelLogin.classList.remove('active');

            toggleHintText.innerHTML = `Already have an account? <a href="#" id="link-toggle-auth-inner" class="renaissance-link">Log in</a>`;
            document.getElementById('link-toggle-auth-inner').addEventListener('click', (e) => {
                e.preventDefault();
                switchTab('login');
            });
        }
    }

    tabLogin.addEventListener('click', () => switchTab('login'));
    tabSignup.addEventListener('click', () => switchTab('signup'));

    if (linkToggleAuth) {
        linkToggleAuth.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('signup');
        });
    }

    // =============================================
    //  Wax Seal Easter Egg
    // =============================================
    if (sealLogo) {
        sealLogo.addEventListener('click', () => {
            showToast('⚜️ By decree of the Duke, thy presence is welcomed in the court!', 'info');
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

    // Log In
    panelLogin.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            showToast('Moniker and passphrase must not be blank!', 'warning');
            return;
        }

        console.log(`Log In Requested: POST /api/auth/login | Username: "${username}"`);
        showToast(`Verifying credentials for "${username}"...`, 'info');

        // Placeholder — replace with real API call
        setTimeout(() => showToast('Access granted! Entering the realm...', 'success'), 1500);
    });

    // Sign Up — auto-login after success
    panelSignup.addEventListener('submit', (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('signup-username');
        const passwordInput = document.getElementById('signup-password');
        const confirmPasswordInput = document.getElementById('signup-confirm-password');

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!username || !password) {
            showToast('Moniker and passphrase must not be blank!', 'warning');
            return;
        }

        if (password !== confirmPassword) {
            showToast('Verily, thy passphrases do not match!', 'warning');
            confirmPasswordInput.focus();
            return;
        }

        console.log(`Sign Up Requested: POST /api/auth/signup | Username: "${username}"`);
        showToast(`Pledging allegiance for "${username}"...`, 'info');

        // Placeholder — on success, auto-login by switching tab and submitting
        setTimeout(() => {
            showToast('Allegiance sworn! Logging you in...', 'success');

            // Switch to login, pre-fill, and auto-submit
            switchTab('login');
            document.getElementById('login-username').value = username;
            document.getElementById('login-password').value = password;

            // Slight delay so the user sees the transition, then auto-submit
            setTimeout(() => {
                panelLogin.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }, 600);
        }, 1500);
    });
});
