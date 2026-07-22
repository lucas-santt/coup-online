// Match create/join/browse — wired to the real FastAPI backend.
//
// A match can be joined two ways, regardless of visibility:
//   - By code: knowing the code is itself the credential, no password
//     needed even for a private match (POST /api/matches/join).
//   - By browsing: public matches join immediately; private matches
//     require the lobby's password, entered inline in the list item
//     (POST /api/matches/{match_id}/join). The real password check
//     happens server-side — there's nothing to fake-check client-side
//     anymore, the list endpoint never sends passwords back down.
//
// Once a create/join call succeeds, control hands off to
// TribunalLobby.enter({ matchId, ... }) — everything about the lobby
// (roster, settings, host, ready states) then arrives via the
// state_snapshot the moment the socket opens; the extra fields passed
// here (joinCode/name/maxPlayers/settings) are just so the sidebar has
// something to render before that snapshot lands.
(() => {
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

	// Small inline icon, kept local since it's a UI marker rather than
	// a toast — if it ends up reused elsewhere, move it into settings.js
	// alongside the toast icon set.
	const LOCK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="match-lock-icon">
		<rect x="6" y="11" width="12" height="9" stroke="currentColor" stroke-width="1.5"/>
		<path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" stroke="currentColor" stroke-width="1.5"/>
		<circle cx="12" cy="15" r="1.2" fill="currentColor"/>
	</svg>`;

	// =============================================
	//  Create Match
	// =============================================
	const btnOpenCreate = document.getElementById('btn-open-create');
	const btnOpenJoin = document.getElementById('btn-open-join');
	const createMatchPanel = document.getElementById('create-match-panel');
	const joinMatchPanel = document.getElementById('join-match-panel');
	const selectMaxPlayers = document.getElementById('select-max-players');
	const inputLobbyName = document.getElementById('input-lobby-name');
	const visibilityRadios = document.querySelectorAll('input[name="visibility"]');
	const groupLobbyPassword = document.getElementById('group-lobby-password');
	const inputLobbyPassword = document.getElementById('input-lobby-password');
	const btnCreateMatch = document.getElementById('btn-create-match');
	const btnJoinCode = document.getElementById('btn-join-code');

	function populateMaxPlayers() {
		const { minPlayers, maxPlayers, defaultMaxPlayers } = LOBBY_SETTINGS.match;
		const minimumPlayers = Math.max(2, minPlayers);
		for (let n = minimumPlayers; n <= maxPlayers; n++) {
			const opt = document.createElement('option');
			opt.value = String(n);
			opt.textContent = `${n} Players`;
			if (n === Math.max(minimumPlayers, defaultMaxPlayers)) opt.selected = true;
			selectMaxPlayers.appendChild(opt);
		}
		selectMaxPlayers.value = String(Math.max(minimumPlayers, defaultMaxPlayers));
	}
	populateMaxPlayers();

	inputLobbyName.maxLength = LOBBY_SETTINGS.match.nameMaxLength;
	inputLobbyPassword.maxLength = LOBBY_SETTINGS.match.passwordMaxLength;
	document.getElementById('input-match-code').maxLength = LOBBY_SETTINGS.match.codeMaxLength;

	// The password field only makes sense for a private lobby, so it
	// stays hidden (and its value cleared) whenever Public is selected.
	function updatePasswordVisibility() {
		const isPrivate = document.querySelector('input[name="visibility"]:checked').value === 'private';
		groupLobbyPassword.classList.toggle('hidden', !isPrivate);
		if (!isPrivate) inputLobbyPassword.value = '';
	}
	visibilityRadios.forEach((radio) => radio.addEventListener('change', updatePasswordVisibility));

	function togglePanel(panelToShow) {
		[createMatchPanel, joinMatchPanel].forEach((panel) => {
			panel.classList.toggle('hidden', panel !== panelToShow);
		});
	}

	function tribunalBlocksMatchFlow() {
		return typeof TribunalLobby !== 'undefined' && TribunalLobby.isActive();
	}

	// Parses the { detail: { error_code, detail } } failure shape without
	// consuming the response body twice — callers that need the raw
	// error_code (to branch on WRONG_PASSWORD, say) use this instead of
	// ToastMessages.fromResponse(), which only returns the display string.
	async function readErrorCode(res) {
		try {
			const data = await res.json();
			return data?.detail?.error_code ?? null;
		} catch {
			return null;
		}
	}

	btnOpenCreate.addEventListener('click', () => {
		if (tribunalBlocksMatchFlow()) return;
		const isOpen = !createMatchPanel.classList.contains('hidden');
		togglePanel(isOpen ? null : createMatchPanel);
	});

	btnOpenJoin.addEventListener('click', () => {
		if (tribunalBlocksMatchFlow()) return;
		const isOpen = !joinMatchPanel.classList.contains('hidden');
		togglePanel(isOpen ? null : joinMatchPanel);
		if (!isOpen) renderMatchList();
	});

	btnCreateMatch.addEventListener('click', async () => {
		if (tribunalBlocksMatchFlow()) return;

		const name = inputLobbyName.value.trim();
		const visibility = document.querySelector('input[name="visibility"]:checked').value;
		const password = inputLobbyPassword.value;
		const maxPlayers = Number(selectMaxPlayers.value);

		if (!name) {
			Toast.show(ToastMessages.matches.nameRequired(), 'warning');
			inputLobbyName.focus();
			return;
		}

		if (visibility === 'private' && !password) {
			Toast.show(ToastMessages.matches.passwordRequired(), 'warning');
			inputLobbyPassword.focus();
			return;
		}

		// Stage 1 only: name, visibility/password, max players.
		// Reformation + bot fill move into stage-2 match settings (host
		// edits them from the tribunal sidebar once seated, via
		// update_settings over the socket).
		const body = {
			lobby_name: name,
			max_players: maxPlayers,
			visibility,
			password: visibility === 'private' ? password : null,
			gamemode: 'classic',
			bot_fill: 'none',
		};

		btnCreateMatch.disabled = true;
		Toast.show(ToastMessages.matches.creating(), 'info');

		try {
			const res = await fetch(LOBBY_SETTINGS.endpoints.matches.create, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				Toast.show(await ToastMessages.fromResponse(res), 'error');
				return;
			}

			const data = await res.json();
			Toast.show(ToastMessages.matches.created(data.join_code), 'success');
			togglePanel(null);

			TribunalLobby.enter({
				matchId: data.match_id,
				joinCode: data.join_code,
				name,
				maxPlayers: data.max_players,
				status: data.status,
				settings: data.settings,
			}, { silent: true });
		} catch (err) {
			Toast.show(ToastMessages.connectionLost(), 'network');
		} finally {
			btnCreateMatch.disabled = false;
		}
	});

	// =============================================
	//  Join Match: Code vs Browse
	// =============================================
	const joinTabs = document.querySelectorAll('.join-tab');
	const joinViews = document.querySelectorAll('.join-view');

	joinTabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			joinTabs.forEach((t) => t.classList.remove('active'));
			tab.classList.add('active');

			const targetId = `join-view-${tab.dataset.jointab}`;
			joinViews.forEach((v) => v.classList.toggle('active', v.id === targetId));

			if (tab.dataset.jointab === 'browse') renderMatchList();
		});
	});

	btnJoinCode.addEventListener('click', async () => {
		if (tribunalBlocksMatchFlow()) return;

		const codeInput = document.getElementById('input-match-code');
		const code = codeInput.value.trim();
		if (!code) {
			Toast.show(ToastMessages.matches.codeRequired(), 'warning');
			return;
		}

		btnJoinCode.disabled = true;
		Toast.show(ToastMessages.matches.seeking(code), 'info');

		try {
			const res = await fetch(LOBBY_SETTINGS.endpoints.matches.joinByCode, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ join_code: code }),
			});

			if (!res.ok) {
				Toast.show(await ToastMessages.fromResponse(res), 'error');
				return;
			}

			const data = await res.json();
			togglePanel(null);
			TribunalLobby.enter({
				matchId: data.match_id,
				joinCode: code.toUpperCase(),
			});
		} catch (err) {
			Toast.show(ToastMessages.connectionLost(), 'network');
		} finally {
			btnJoinCode.disabled = false;
		}
	});

	// =============================================
	//  Browse public (and, inline-password-gated, private) matches
	// =============================================
	const matchListEl = document.getElementById('match-list');
	const filterPlayers = document.getElementById('filter-players');
	const filterVisibility = document.getElementById('filter-visibility');
	const filterSearch = document.getElementById('filter-search');
	const filterReformation = document.getElementById('filter-reformation');

	filterSearch.maxLength = LOBBY_SETTINGS.match.searchMaxLength;

	// Player-count filter options depend on the configured max, so build
	// them the same way the create-match select does instead of hardcoding.
	(function populatePlayerFilter() {
		const { minPlayers, maxPlayers } = LOBBY_SETTINGS.match;
		for (let n = minPlayers; n <= maxPlayers; n++) {
			const opt = document.createElement('option');
			opt.value = String(n);
			opt.textContent = `${n} players`;
			filterPlayers.appendChild(opt);
		}
	})();

	// Debounced so we're not re-querying the backend on every keystroke.
	let searchDebounceTimer = null;
	filterSearch.addEventListener('input', () => {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(renderMatchList, 200);
	});

	// Bumped on every renderMatchList() call so a slow, stale response
	// can't clobber the list after a newer request already landed.
	let listRequestToken = 0;

	async function renderMatchList() {
		const requestToken = ++listRequestToken;

		const playerFilter = filterPlayers.value; // 'any' | '2'..'10'
		const visibilityFilter = filterVisibility.value; // 'public' | 'all'
		const reformationFilter = filterReformation.value; // 'any' | 'yes' | 'no'
		const searchTerm = filterSearch.value.trim();

		const params = new URLSearchParams();
		if (searchTerm) params.set('lobby_name', searchTerm);
		if (playerFilter !== 'any') params.set('max_players', playerFilter);
		if (visibilityFilter === 'public') params.set('visibility', 'public');

		matchListEl.innerHTML = '<li class="match-list-loading">Consulting the register...</li>';

		let matches;
		try {
			const res = await fetch(`${LOBBY_SETTINGS.endpoints.matches.list}?${params.toString()}`, {
				credentials: 'same-origin',
			});
			if (requestToken !== listRequestToken) return; // superseded by a newer call

			if (!res.ok) {
				matchListEl.innerHTML = '';
				Toast.show(await ToastMessages.fromResponse(res), 'error');
				return;
			}
			matches = await res.json();
		} catch (err) {
			if (requestToken !== listRequestToken) return;
			matchListEl.innerHTML = '';
			Toast.show(ToastMessages.connectionLost(), 'network');
			return;
		}

		// reformation is server-provided but the search/name filter above
		// is the only one the backend applies beyond players/visibility;
		// reformation itself is filtered client-side since it's a small
		// list per query and not worth another round trip shape.
		const filtered = matches.filter((m) => {
			if (reformationFilter === 'yes' && !m.reformation) return false;
			if (reformationFilter === 'no' && m.reformation) return false;
			return true;
		});

		matchListEl.innerHTML = '';

		if (filtered.length === 0) {
			const empty = document.createElement('li');
			empty.className = 'match-list-empty';
			empty.textContent = ToastMessages.matches.noMatchesFound();
			matchListEl.appendChild(empty);
			return;
		}

		filtered.forEach((m) => {
			const item = document.createElement('li');
			item.className = 'match-list-item';
			item.innerHTML = `
				<div class="match-info">
					<span class="match-host">${escapeHtml(m.lobby_name)}${m.visibility === 'private' ? `<span class="match-lock" title="Private lobby">${LOCK_ICON_SVG}</span>` : ''}</span>
					<span class="match-meta">Hosted by ${escapeHtml(m.host_name)} · ${m.player_count}/${m.max_players} players${m.reformation ? ' · Reformation' : ''}</span>
				</div>
				<div class="match-join-area"></div>
			`;
			renderJoinControl(item.querySelector('.match-join-area'), m);
			matchListEl.appendChild(item);
		});
	}

	function escapeHtml(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	// Swaps a match row's join area between a plain "Join" button and,
	// for private matches, an inline password prompt.
	function renderJoinControl(container, m) {
		container.innerHTML = '';

		const joinBtn = document.createElement('button');
		joinBtn.className = 'medieval-btn secondary-btn small-btn match-join-btn';
		joinBtn.textContent = 'Join';
		joinBtn.addEventListener('click', () => {
			if (m.visibility === 'private') {
				renderPasswordPrompt(container, m);
			} else {
				requestJoinById(m);
			}
		});

		container.appendChild(joinBtn);
	}

	function renderPasswordPrompt(container, m) {
		container.innerHTML = `
			<div class="match-password-prompt">
				<input type="password" class="match-password-input" placeholder="Password" aria-label="Password for ${escapeHtml(m.lobby_name)}">
				<button type="button" class="medieval-btn primary-btn small-btn match-password-confirm">Enter</button>
			</div>
		`;

		const input = container.querySelector('.match-password-input');
		const confirmBtn = container.querySelector('.match-password-confirm');
		input.focus();

		// The real gate is the backend's 401 on join — there's nothing to
		// pre-check client-side anymore, the browse list never carries
		// match passwords.
		async function attempt() {
			confirmBtn.disabled = true;
			input.disabled = true;
			const result = await requestJoinById(m, input.value);
			if (!result.ok) {
				confirmBtn.disabled = false;
				input.disabled = false;
				if (result.errorCode === 'WRONG_PASSWORD') {
					input.value = '';
					input.focus();
				}
			}
		}

		confirmBtn.addEventListener('click', attempt);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') attempt();
			if (e.key === 'Escape') renderJoinControl(container, m);
		});
	}

	async function requestJoinById(m, password = null) {
		if (tribunalBlocksMatchFlow()) return { ok: false, errorCode: null };

		Toast.show(ToastMessages.matches.joining(m.lobby_name), 'info');

		try {
			const res = await fetch(LOBBY_SETTINGS.endpoints.matches.joinById(m.match_id), {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password }),
			});

			if (!res.ok) {
				const errorCode = await readErrorCode(res);
				Toast.show(
					errorCode === 'WRONG_PASSWORD'
						? ToastMessages.matches.wrongPassword()
						: ToastMessages.fromErrorCode(errorCode),
					'warning',
				);
				return { ok: false, errorCode };
			}

			const data = await res.json();
			togglePanel(null);
			TribunalLobby.enter({
				matchId: data.match_id,
				name: m.lobby_name,
				maxPlayers: m.max_players,
			});
			return { ok: true, errorCode: null };
		} catch (err) {
			Toast.show(ToastMessages.connectionLost(), 'network');
			return { ok: false, errorCode: null };
		}
	}

	filterPlayers.addEventListener('change', renderMatchList);
	filterVisibility.addEventListener('change', renderMatchList);
	filterReformation.addEventListener('change', renderMatchList);
})();