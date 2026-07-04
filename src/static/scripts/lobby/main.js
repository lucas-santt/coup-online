document.addEventListener('DOMContentLoaded', () => {
	// =============================================
	//  Session State
	// =============================================
	let currentUser = null; // { isGuest, username, displayName, avatarUrl }

	const lobbyContainer = document.getElementById('lobby-container');
	const displayNameEl = document.getElementById('display-name');
	const displayNameInput = document.getElementById('display-name-input');
	const btnEditName = document.getElementById('btn-edit-name');
	const btnAvatar = document.getElementById('btn-avatar');
	const avatarInput = document.getElementById('avatar-input');
	const avatarImg = document.getElementById('avatar-img');
	const btnAuthAction = document.getElementById('btn-auth-action');
	const tabFriends = document.getElementById('tab-friends');

	function revealLobby(result) {
		currentUser = {
			isGuest: result.isGuest,
			username: result.username,
			displayName: result.isGuest ? `Guest-${Math.floor(1000 + Math.random() * 9000)}` : result.username,
			avatarUrl: null,
		};

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
			Toast.show('Farewell for now, traveller.', 'info');
			currentUser = null;
			lobbyContainer.classList.add('hidden');
			AuthOverlay.open({ context: 'gate', onDone: revealLobby });
		}
	});

	// =============================================
	//  Header: Avatar
	// =============================================
	btnAvatar.addEventListener('click', () => avatarInput.click());

	avatarInput.addEventListener('change', () => {
		const file = avatarInput.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			avatarImg.src = reader.result;
			console.log(`Avatar Upload Requested: POST ${LOBBY_SETTINGS.endpoints.profile.avatar} | file: "${file.name}"`);
			Toast.show('Portrait updated.', 'success');
		};
		reader.readAsDataURL(file);
	});

	// =============================================
	//  Header: Display Name (click-to-edit)
	// =============================================
	function startEditingName() {
		displayNameInput.value = currentUser.displayName;
		displayNameInput.maxLength = LOBBY_SETTINGS.displayName.maxLength;
		displayNameEl.classList.add('hidden');
		displayNameInput.classList.remove('hidden');
		displayNameInput.focus();
		displayNameInput.select();
	}

	function commitNameEdit() {
		const newName = displayNameInput.value.trim();
		displayNameInput.classList.add('hidden');
		displayNameEl.classList.remove('hidden');

		if (!newName || newName === currentUser.displayName) return;

		currentUser.displayName = newName;
		displayNameEl.textContent = newName;
		console.log(`Display Name Update: PATCH ${LOBBY_SETTINGS.endpoints.profile.displayName} | display_name: "${newName}"`);
		Toast.show('Name updated.', 'success');
	}

	btnEditName.addEventListener('click', startEditingName);
	displayNameEl.addEventListener('click', startEditingName);
	displayNameInput.addEventListener('blur', commitNameEdit);
	displayNameInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') displayNameInput.blur();
		if (e.key === 'Escape') {
			displayNameInput.value = currentUser.displayName;
			displayNameInput.blur();
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

			if (tab.dataset.tab === 'friends') loadFriends();
		});
	});

	// =============================================
	//  Create Match
	// =============================================
	const btnOpenCreate = document.getElementById('btn-open-create');
	const btnOpenJoin = document.getElementById('btn-open-join');
	const createMatchPanel = document.getElementById('create-match-panel');
	const joinMatchPanel = document.getElementById('join-match-panel');
	const selectMaxPlayers = document.getElementById('select-max-players');

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
		const body = {
			reformation: document.getElementById('toggle-reformation').checked,
			max_players: Number(selectMaxPlayers.value),
			visibility: document.querySelector('input[name="visibility"]:checked').value,
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

	// Mock session browser data (no backend yet, see settings.js contract)
	const MOCK_MATCHES = [
		{ match_id: 'a1', host_name: 'Brutus', player_count: 2, max_players: 4, visibility: 'public', reformation: false },
		{ match_id: 'a2', host_name: 'Livia', player_count: 3, max_players: 4, visibility: 'public', reformation: true },
		{ match_id: 'a3', host_name: 'Cassius', player_count: 1, max_players: 2, visibility: 'public', reformation: false },
		{ match_id: 'a4', host_name: 'Octavia', player_count: 4, max_players: 6, visibility: 'private', reformation: true },
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
					<span class="match-host">${m.host_name}'s Court</span>
					<span class="match-meta">${m.player_count}/${m.max_players} players · ${m.visibility}${m.reformation ? ' · Reformation' : ''}</span>
				</div>
				<button class="medieval-btn secondary-btn small-btn match-join-btn">Join</button>
			`;
			item.querySelector('.match-join-btn').addEventListener('click', () => {
				console.log(`Join By Id Requested: POST ${LOBBY_SETTINGS.endpoints.matches.joinById(m.match_id)}`);
				Toast.show(`Joining ${m.host_name}'s court...`, 'info');
			});
			matchListEl.appendChild(item);
		});
	}

	filterPlayers.addEventListener('change', renderMatchList);
	filterVisibility.addEventListener('change', renderMatchList);

	// =============================================
	//  Friends
	// =============================================
	const friendsGuestMessage = document.getElementById('friends-guest-message');
	const friendsListEl = document.getElementById('friends-list');

	function loadFriends() {
		if (!currentUser || currentUser.isGuest) {
			friendsGuestMessage.classList.remove('hidden');
			friendsListEl.classList.add('hidden');
			return;
		}

		friendsGuestMessage.classList.add('hidden');
		friendsListEl.classList.remove('hidden');

		console.log(`Friends List Requested: GET ${LOBBY_SETTINGS.endpoints.friends.list}`);
		// Mock data until the endpoint exists
		const mockFriends = [
			{ username: 'brutus77', display_name: 'Brutus', status: 'online' },
			{ username: 'livia_a', display_name: 'Livia', status: 'offline' },
		];

		friendsListEl.innerHTML = '';
		mockFriends.forEach((f) => {
			const li = document.createElement('li');
			li.className = 'friend-item';
			li.innerHTML = `
				<span class="friend-status friend-status-${f.status}"></span>
				<span class="friend-name">${f.display_name}</span>
			`;
			friendsListEl.appendChild(li);
		});
	}

	// =============================================
	//  Settings: Music Volume (settings tab + floating widget, synced)
	// =============================================
	const bgMusic = document.getElementById('bg-music');

	const musicControls = [
		{
			btn: document.getElementById('btn-music-toggle'),
			icon: document.getElementById('music-icon'),
			slider: document.getElementById('volume-slider'),
		},
		{
			btn: document.getElementById('btn-music-toggle-float'),
			icon: document.getElementById('music-icon-float'),
			slider: document.getElementById('volume-slider-float'),
		},
	];

	let isMuted = false;
	let currentSliderVal = LOBBY_SETTINGS.audio.defaultVolume;
	let fadeInterval = null;

	bgMusic.volume = LOBBY_SETTINGS.audio.defaultVolume;

	function syncSliders(val) {
		musicControls.forEach(({ slider }) => {
			slider.value = val;
			slider.style.setProperty('--fill', val + '%');
		});
	}

	function setMutedState(muted) {
		isMuted = muted;
		musicControls.forEach(({ icon, btn }) => {
			icon.classList.toggle('muted', muted);
			btn.setAttribute('aria-label', muted ? 'Play music' : 'Mute music');
		});
	}

	syncSliders(LOBBY_SETTINGS.audio.defaultVolume * 100);

	function tryStartMusic() {
		if (bgMusic.paused && !isMuted) bgMusic.play().catch(() => {});
		document.removeEventListener('click', tryStartMusic);
		document.removeEventListener('keydown', tryStartMusic);
	}
	document.addEventListener('click', tryStartMusic);
	document.addEventListener('keydown', tryStartMusic);

	musicControls.forEach(({ btn }) => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (isMuted || bgMusic.paused) {
				bgMusic.play();
				setMutedState(false);
				bgMusic.volume = currentSliderVal;
			} else {
				bgMusic.pause();
				setMutedState(true);
			}
		});
	});

	function updateVolume(val) {
		currentSliderVal = val / 100;
		syncSliders(val);

		if (!isMuted && !bgMusic.paused) bgMusic.volume = currentSliderVal;

		if (val == 0) {
			setMutedState(true);
		} else if (isMuted) {
			setMutedState(false);
			if (bgMusic.paused) bgMusic.play().catch(() => {});
		}
	}

	musicControls.forEach(({ slider }) => {
		slider.addEventListener('input', (e) => updateVolume(e.target.value));
	});

	function fadeVolumeTo(targetVolume, duration = LOBBY_SETTINGS.audio.fadeDefaultDurationMs) {
		if (isMuted || bgMusic.paused) return;

		clearInterval(fadeInterval);
		const startVolume = bgMusic.volume;
		const steps = LOBBY_SETTINGS.audio.fadeSteps;
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
		fadeVolumeTo(currentSliderVal * LOBBY_SETTINGS.audio.blurVolumeMultiplier, LOBBY_SETTINGS.audio.fadeFocusDurationMs);
	});
	window.addEventListener('focus', () => {
		fadeVolumeTo(currentSliderVal, LOBBY_SETTINGS.audio.fadeFocusDurationMs);
	});
});