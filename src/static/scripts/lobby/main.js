// Lobby entry point: reveals the lobby once auth resolves, wires the
// header's login/logout button, and drives tab switching. Avatar/name
// editing lives in profile.js, match create/join in matches.js, the
// friends list in friends.js, and music in music.js.
(() => {
	const lobbyContainer = document.getElementById('lobby-container');
	const displayNameEl = document.getElementById('display-name');
	const btnAuthAction = document.getElementById('btn-auth-action');
	const tabFriends = document.getElementById('tab-friends');

	async function revealLobby(result) {
		let profile;
		try {
			const res = await fetch(LOBBY_SETTINGS.endpoints.profile.me, {
				credentials: 'same-origin',
			});
			if (!res.ok) throw new Error('profile fetch failed');
			profile = await res.json();
		} catch (err) {
			Toast.show(ToastMessages.connectionLost(), 'network');
			return;
		}

		LobbySession.set({
			isGuest: profile.is_guest,
			username: profile.username,
			displayName: profile.displayname,
			avatarUrl: profile.avatar_url,
		});
		const currentUser = LobbySession.get();

		const avatarImg = document.getElementById('avatar-img');
		if (avatarImg && currentUser.avatarUrl) {
			avatarImg.src = `${currentUser.avatarUrl}?t=${Date.now()}`;
		}

		displayNameEl.textContent = currentUser.displayName;
		btnAuthAction.textContent = currentUser.isGuest ? 'Login / Sign Up' : 'Logout';
		tabFriends.disabled = currentUser.isGuest;

		lobbyContainer.classList.remove('hidden');
	}

	// First gate: blocking, must resolve to guest/login/signup
	AuthOverlay.open({ context: 'gate', onDone: revealLobby });

	// =============================================
	//  Header: Login/Signup <-> Logout
	// =============================================
	btnAuthAction.addEventListener('click', () => {
		const currentUser = LobbySession.get();

		if (!currentUser || currentUser.isGuest) {
			// Guest asking to secure their account: reuses the overlay
			// in "convert" mode so it's dismissible and skips the guest option.
			AuthOverlay.open({
				context: 'convert',
				onDone: (result) => {
					if (result.authenticated) revealLobby(result);
					// else: cancelled, stay as guest, nothing to do
				},
			});
		} else {
			console.log(`Logout Requested: POST ${LOBBY_SETTINGS.endpoints.auth.logout}`);
			Toast.show(ToastMessages.session.loggedOut(), 'info');
			LobbySession.set(null);
			lobbyContainer.classList.add('hidden');
			AuthOverlay.open({ context: 'gate', onDone: revealLobby });
		}
	});

	// =============================================
	//  Tabs
	// =============================================
	const tabs = document.querySelectorAll('.lobby-tab');
	const panels = document.querySelectorAll('.lobby-panel');

	tabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			if (tab.disabled) return;

			tabs.forEach((t) => {
				t.classList.remove('active');
				t.setAttribute('aria-selected', 'false');
			});
			tab.classList.add('active');
			tab.setAttribute('aria-selected', 'true');

			const targetId = `panel-${tab.dataset.tab}`;
			panels.forEach((p) => p.classList.toggle('active', p.id === targetId));

			if (tab.dataset.tab === 'friends') Friends.load();
		});
	});
})();