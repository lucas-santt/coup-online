// Match create/join/browse.
//
// A match can be joined two ways, regardless of visibility:
//   - By code: knowing the code is itself the credential, no password
//     needed even for a private match.
//   - By browsing: public matches join immediately; private matches
//     require the lobby's password, entered inline in the list item.
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

	document.getElementById('btn-create-match').addEventListener('click', () => {
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
		// Reformation + bot fill move into stage-2 match settings.
		const body = {
			lobby_name: name,
			max_players: maxPlayers,
			visibility,
			password: visibility === 'private' ? password : null,
			gamemode: 'classic',
			bot_fill: 'none',
		};

		console.log(`Create Match Requested: POST ${LOBBY_SETTINGS.endpoints.matches.create}`, body);
		Toast.show(ToastMessages.matches.creating(), 'info');

		setTimeout(() => {
			const mockJoinCode = Math.random().toString(36).substring(2, 7).toUpperCase();
			const mockMatchId = `m-${Date.now().toString(36)}`;
			Toast.show(ToastMessages.matches.created(mockJoinCode), 'success');
			togglePanel(null);

			const user = LobbySession.get() || {};
			const localId = user.username || `host-${Date.now()}`;
			TribunalLobby.enter({
				matchId: mockMatchId,
				joinCode: mockJoinCode,
				name,
				maxPlayers,
				localPlayerId: localId,
				players: [{
					id: localId,
					displayName: user.displayName || user.username || 'Citizen',
					avatarUrl: user.avatarUrl || null,
					isHost: true,
					ready: false,
					readyForever: false,
					isSpectator: false,
					joinOrder: 0,
				}],
			}, { silent: true });
		}, 800);
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

	document.getElementById('btn-join-code').addEventListener('click', () => {
		if (tribunalBlocksMatchFlow()) return;

		const code = document.getElementById('input-match-code').value.trim();
		if (!code) {
			Toast.show(ToastMessages.matches.codeRequired(), 'warning');
			return;
		}

		console.log(`Join By Code Requested: POST ${LOBBY_SETTINGS.endpoints.matches.joinByCode}`, { code });
		Toast.show(ToastMessages.matches.seeking(code), 'info');

		setTimeout(() => {
			togglePanel(null);
			enterJoinedLobby({
				matchId: `m-code-${code.toUpperCase()}`,
				joinCode: code.toUpperCase(),
				name: `Tribunal ${code.toUpperCase()}`,
				maxPlayers: LOBBY_SETTINGS.match.defaultMaxPlayers,
				hostName: 'Host Officer',
			});
		}, 600);
	});

	function enterJoinedLobby({ matchId, joinCode, name, maxPlayers, hostName }) {
		const user = LobbySession.get() || {};
		const localId = user.username || `guest-${Date.now()}`;
		TribunalLobby.enter({
			matchId,
			joinCode,
			name,
			maxPlayers,
			localPlayerId: localId,
			players: [
				{
					id: 'host-stub',
					displayName: hostName || 'Host Officer',
					avatarUrl: null,
					isHost: true,
					ready: true,
					readyForever: false,
					isSpectator: false,
					joinOrder: 0,
				},
				{
					id: localId,
					displayName: user.displayName || user.username || 'Citizen',
					avatarUrl: user.avatarUrl || null,
					isHost: false,
					ready: false,
					readyForever: false,
					isSpectator: false,
					joinOrder: 1,
				},
			],
		});
	}

	// Mock session browser data (no backend yet, see settings.js contract).
	// `password` is only ever used client-side here to fake the check the
	// real backend will do; it's never sent back down in the real list response.
	const MOCK_MATCHES = [
		{ match_id: 'a1', name: "Brutus's Court", host_name: 'Brutus', player_count: 2, max_players: 4, visibility: 'public', reformation: false, password: null },
		{ match_id: 'a2', name: "Livia's Gathering", host_name: 'Livia', player_count: 3, max_players: 4, visibility: 'public', reformation: true, password: null },
		{ match_id: 'a3', name: "Cassius' Duel", host_name: 'Cassius', player_count: 1, max_players: 2, visibility: 'public', reformation: false, password: null },
		{ match_id: 'a4', name: "Octavia's Inner Circle", host_name: 'Octavia', player_count: 4, max_players: 6, visibility: 'private', reformation: true, password: 'senate' },
	];

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

	// Debounced so we're not re-filtering/re-rendering on every keystroke.
	let searchDebounceTimer = null;
	filterSearch.addEventListener('input', () => {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(renderMatchList, 200);
	});

	function renderMatchList() {
		const playerFilter = filterPlayers.value;
		const visibilityFilter = filterVisibility.value;
		const reformationFilter = filterReformation.value; // 'any' | 'yes' | 'no'
		const searchTerm = filterSearch.value.trim().toLowerCase();

		const filtered = MOCK_MATCHES.filter((m) => {
			if (visibilityFilter === 'public' && m.visibility !== 'public') return false;
			if (playerFilter !== 'any' && m.max_players !== Number(playerFilter)) return false;
			if (reformationFilter === 'yes' && !m.reformation) return false;
			if (reformationFilter === 'no' && m.reformation) return false;
			if (searchTerm && !m.name.toLowerCase().includes(searchTerm)) return false;
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
					<span class="match-host">${m.name}${m.visibility === 'private' ? `<span class="match-lock" title="Private lobby">${LOCK_ICON_SVG}</span>` : ''}</span>
					<span class="match-meta">Hosted by ${m.host_name} · ${m.player_count}/${m.max_players} players${m.reformation ? ' · Reformation' : ''}</span>
				</div>
				<div class="match-join-area"></div>
			`;
			renderJoinControl(item.querySelector('.match-join-area'), m);
			matchListEl.appendChild(item);
		});
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
				<input type="password" class="match-password-input" placeholder="Password" aria-label="Password for ${m.name}">
				<button type="button" class="medieval-btn primary-btn small-btn match-password-confirm">Enter</button>
			</div>
		`;

		const input = container.querySelector('.match-password-input');
		const confirmBtn = container.querySelector('.match-password-confirm');
		input.focus();

		function attempt() {
			// Mock-only check; the real gate is the backend's 401 on join.
			if (input.value === m.password) {
				requestJoinById(m, input.value);
			} else {
				Toast.show(ToastMessages.matches.wrongPassword(), 'warning');
				input.value = '';
				input.focus();
			}
		}

		confirmBtn.addEventListener('click', attempt);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') attempt();
			if (e.key === 'Escape') renderJoinControl(container, m);
		});
	}

	function requestJoinById(m, password = null) {
		if (tribunalBlocksMatchFlow()) return;

		console.log(`Join By Id Requested: POST ${LOBBY_SETTINGS.endpoints.matches.joinById(m.match_id)}`, { password });
		Toast.show(ToastMessages.matches.joining(m.name), 'info');

		setTimeout(() => {
			togglePanel(null);
			enterJoinedLobby({
				matchId: m.match_id,
				joinCode: m.match_id.toUpperCase().slice(0, 5),
				name: m.name,
				maxPlayers: m.max_players,
				hostName: m.host_name,
			});
		}, 600);
	}

	filterPlayers.addEventListener('change', renderMatchList);
	filterVisibility.addEventListener('change', renderMatchList);
	filterReformation.addEventListener('change', renderMatchList);
})();