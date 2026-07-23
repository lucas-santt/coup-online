// Lobby entry point: reveals the lobby once auth resolves, wires the
// header's login/logout button, and drives tab switching. Avatar/name
// editing lives in profile.js, match create/join in matches.js, the
// friends list in friends.js, and music in music.js.
(() => {
	// Invite link support: ?join=CODE drops whoever opens it straight into
	// that match once they've picked login/signup/guest at the auth gate.
	// Read + strip immediately (before the overlay even opens) so a reload
	// mid-auth doesn't re-trigger it, and so the code doesn't linger visibly
	// in the address bar longer than it needs to.
	const params = new URLSearchParams(window.location.search);
	let pendingInviteCode = params.get('join');
	if (pendingInviteCode) {
		params.delete('join');
		const cleanQuery = params.toString();
		window.history.replaceState(null, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));
	}

	const lobbyContainer = document.getElementById('lobby-container');
	const displayNameEl = document.getElementById('display-name');
	const btnAuthAction = document.getElementById('btn-auth-action');
	const tabFriends = document.getElementById('tab-friends');

	function bindTouchFriendlyClick(element, handler) {
		if (!element) return;
		let suppressNextClick = false;
		element.addEventListener('touchend', (event) => {
			suppressNextClick = true;
			event.preventDefault();
			handler(event);
			window.setTimeout(() => {
				suppressNextClick = false;
			}, 0);
		}, { passive: false });
		element.addEventListener('click', (event) => {
			if (suppressNextClick) {
				suppressNextClick = false;
				return;
			}
			handler(event);
		});
	}

	const SESSION_STORAGE_KEY = LOBBY_SETTINGS.auth.sessionStorageKey;

	// Split out of revealLobby so the boot-time silent check (below) can
	// tell "no session" apart from "network's down" without popping a
	// connection-lost toast on every reload of a logged-out browser.
	async function fetchProfile() {
		try {
			const res = await fetch(LOBBY_SETTINGS.endpoints.profile.me, {
				credentials: 'same-origin',
			});
			if (!res.ok) return { ok: false, networkError: false };
			return { ok: true, profile: await res.json() };
		} catch (err) {
			return { ok: false, networkError: true };
		}
	}

	// Returns true once the lobby is actually showing, false if there was
	// no valid session (or the request failed) to reveal it with.
	async function revealLobby() {
		const { ok, profile, networkError } = await fetchProfile();
		if (!ok) {
			if (networkError) Toast.show(ToastMessages.connectionLost(), 'network');
			return false;
		}

		LobbySession.set({
			isGuest: profile.is_guest,
			username: profile.username,
			displayName: profile.displayname,
			avatarUrl: profile.avatar_url,
		});
		const currentUser = LobbySession.get();
		// A profile fetch only succeeds with a valid session_token cookie,
		// so this is confirmation (not an assumption) that we're logged in —
		// safe to remember for next time the page loads.
		localStorage.setItem(SESSION_STORAGE_KEY, '1');

		const avatarImg = document.getElementById('avatar-img');
		if (avatarImg && currentUser.avatarUrl) {
			avatarImg.src = `${currentUser.avatarUrl}?t=${Date.now()}`;
		}

		displayNameEl.textContent = currentUser.displayName;
		btnAuthAction.textContent = currentUser.isGuest ? 'Login / Sign Up' : 'Logout';
		tabFriends.disabled = currentUser.isGuest;

		lobbyContainer.classList.remove('hidden');
		SessionSocket.connect();

		// Rejoin an in-progress tribunal session (sidebar) if one was stored.
		// Only fall through to the invite code if the player isn't already
		// seated somewhere — an existing session always wins.
		const rejoined = await TribunalLobby.checkForActiveSession();
		const inviteCode = pendingInviteCode;
		pendingInviteCode = null;
		if (!rejoined && inviteCode) {
			const result = await Matches.joinByCode(inviteCode, { silent: true });
			if (result.ok) {
				Toast.show(ToastMessages.matches.joinedViaLink(), 'success');
			} else if (result.errorCode) {
				// Bad/expired code, match already started, or it filled up
				// while they were at the auth gate — land them in the plain
				// lobby instead of a dead end.
				Toast.show(ToastMessages.fromErrorCode(result.errorCode), 'warning');
			}
		}

		return true;
	}

	// If we were logged in last time this page loaded, try to silently
	// resume that session (session_token cookie is still what actually
	// authenticates the request — this just decides whether it's worth
	// trying before falling back to the blocking gate overlay). Skips
	// the overlay entirely on success, so a refresh doesn't boot the
	// player back out to the login screen.
	(async () => {
		const hadSession = localStorage.getItem(SESSION_STORAGE_KEY) === '1';
		if (hadSession && (await revealLobby())) return;

		localStorage.removeItem(SESSION_STORAGE_KEY);
		AuthOverlay.open({ context: 'gate', onDone: revealLobby });
	})();

	// Shared by manual logout and getting displaced by a newer login
	// elsewhere — both end with this tab holding a dead session and
	// needing to land back on the auth gate.
	async function clearSessionLocally() {
		SessionSocket.disconnect();
		// Best-effort: the cookie's session_token has already been rotated
		// out from under us in the session-replaced case (the login that
		// displaced us assigned a fresh one), so this resolves to "no
		// matching session" server-side and just clears the cookie — it
		// can't accidentally log out whichever device now holds the
		// account. In the manual-logout case it's the real thing.
		try {
			await fetch(LOBBY_SETTINGS.endpoints.auth.logout, {
				method: 'POST',
				credentials: 'same-origin',
			});
		} catch (err) {
			// proceed with local cleanup regardless
		}

		if (TribunalLobby.isActive()) TribunalLobby.leave();
		LobbySession.set(null);
		localStorage.removeItem(SESSION_STORAGE_KEY);
		lobbyContainer.classList.add('hidden');
	}

	// Pushed by backend/routers/websockets.py's LobbyConnectionManager the
	// moment someone else logs into this same account — we lost the
	// account to a newer login, so there's nothing to silently resume;
	// land back on the blocking gate same as a manual logout, not the
	// silent auto-login path.
	document.addEventListener('session-replaced', async () => {
		await clearSessionLocally();
		Toast.show(ToastMessages.session.sessionReplaced(), 'warning');
		AuthOverlay.open({ context: 'gate', onDone: revealLobby });
	});

	// =============================================
	//  Header: Login/Signup <-> Logout
	// =============================================
	btnAuthAction.addEventListener('click', async () => {
		const currentUser = LobbySession.get();

		if (!currentUser || currentUser.isGuest) {
			// Guest asking to secure their account: reuses the overlay
			// in "convert" mode so it's dismissible and skips the guest option.
			AuthOverlay.open({
				context: 'convert',
				onDone: (result) => {
					if (result.authenticated) revealLobby();
					// else: cancelled, stay as guest, nothing to do
				},
			});
		} else {
			await clearSessionLocally();
			Toast.show(ToastMessages.session.loggedOut(), 'info');
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