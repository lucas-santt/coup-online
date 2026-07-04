// Match create/join/browse.
//
// A match can be joined two ways, regardless of visibility:
//   - By code: knowing the code is itself the credential, no password
//     needed even for a private match.
//   - By browsing: public matches join immediately; private matches
//     require the lobby's password, entered inline in the list item.
(() => {
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
		for (let n = minPlayers; n <= maxPlayers; n++) {
			const opt = document.createElement('option');
			opt.value = String(n);
			opt.textContent = `${n} Players`;
			if (n === defaultMaxPlayers) opt.selected = true;
			selectMaxPlayers.appendChild(opt);
		}
	}
	populateMaxPlayers();

	inputLobbyName.maxLength = LOBBY_SETTINGS.match.nameMaxLength;
	inputLobbyPassword.maxLength = LOBBY_SETTINGS.match.passwordMaxLength;

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

	btnOpenCreate.addEventListener('click', () => {
		const isOpen = !createMatchPanel.classList.contains('hidden');
		togglePanel(isOpen ? null : createMatchPanel);
	});

	btnOpenJoin.addEventListener('click', () => {
		const isOpen = !joinMatchPanel.classList.contains('hidden');
		togglePanel(isOpen ? null : joinMatchPanel);
		if (!isOpen) renderMatchList();
	});

	document.getElementById('btn-create-match').addEventListener('click', () => {
		const name = inputLobbyName.value.trim();
		const visibility = document.querySelector('input[name="visibility"]:checked').value;
		const password = inputLobbyPassword.value;

		if (!name) {
			Toast.show('Name thy court before creating a match!', 'warning');
			inputLobbyName.focus();
			return;
		}

		if (visibility === 'private' && !password) {
			Toast.show('Set a passphrase to guard thy private court!', 'warning');
			inputLobbyPassword.focus();
			return;
		}

		const body = {
			name,
			reformation: document.getElementById('toggle-reformation').checked,
			max_players: Number(selectMaxPlayers.value),
			visibility,
			password: visibility === 'private' ? password : null,
			bot_fill: document.getElementById('select-bot-fill').value,
		};

		console.log(`Create Match Requested: POST ${LOBBY_SETTINGS.endpoints.matches.create}`, body);
		Toast.show('Creating your match...', 'info');

		setTimeout(() => {
			const mockJoinCode = Math.random().toString(36).substring(2, 7).toUpperCase();
			Toast.show(`Match created! Code: ${mockJoinCode}`, 'success');
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
		const code = document.getElementById('input-match-code').value.trim();
		if (!code) {
			Toast.show('Enter a match code first.', 'warning');
			return;
		}

		console.log(`Join By Code Requested: POST ${LOBBY_SETTINGS.endpoints.matches.joinByCode}`, { code });
		Toast.show(`Seeking match "${code}"...`, 'info');
	});

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

	function renderMatchList() {
		const playerFilter = filterPlayers.value;
		const visibilityFilter = filterVisibility.value;

		const filtered = MOCK_MATCHES.filter((m) => {
			if (visibilityFilter === 'public' && m.visibility !== 'public') return false;
			if (playerFilter !== 'any' && m.max_players !== Number(playerFilter)) return false;
			return true;
		});

		matchListEl.innerHTML = '';

		if (filtered.length === 0) {
			const empty = document.createElement('li');
			empty.className = 'match-list-empty';
			empty.textContent = 'No matches found. Try widening your filters.';
			matchListEl.appendChild(empty);
			return;
		}

		filtered.forEach((m) => {
			const item = document.createElement('li');
			item.className = 'match-list-item';
			item.innerHTML = `
				<div class="match-info">
					<span class="match-host">${m.name}${m.visibility === 'private' ? ' <span class="match-lock" title="Private lobby">🔒</span>' : ''}</span>
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
				Toast.show('Incorrect passphrase.', 'warning');
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
		console.log(`Join By Id Requested: POST ${LOBBY_SETTINGS.endpoints.matches.joinById(m.match_id)}`, { password });
		Toast.show(`Joining "${m.name}"...`, 'info');
	}

	filterPlayers.addEventListener('change', renderMatchList);
	filterVisibility.addEventListener('change', renderMatchList);
})();