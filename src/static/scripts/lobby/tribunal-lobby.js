// Persistent in-match tribunal lobby (sidebar overlay).
//
// After create/join (or reconnect via checkForActiveSession), the player
// stays in the main lobby shell with this sidebar docked — not a blocking
// waiting-room screen. Host/co-host share identical permissions.
//
// API stubs below (removePlayer, sendPingToUnready, onSettingsChange,
// promoteToHost, leaveTribunal, startMatch) are meant to be swapped for
// real WebSocket / REST calls later.

const TribunalLobby = (() => {
	const STORAGE_KEY = () => LOBBY_SETTINGS.match.sessionStorageKey || 'coupe.activeTribunal';
	const PING_COOLDOWN_MS = () => LOBBY_SETTINGS.match.pingCooldownMs || 10_000;
	const PING_CUE_SRC = () => LOBBY_SETTINGS.match.pingCueSrc || '/static/assets/ping.wav';
	const PING_CUE_LOUDER_SRC = () => LOBBY_SETTINGS.match.pingCueLouderSrc || '/static/assets/ping-louder.wav';
	const PING_CUE_LOUDER_EVERY_NTH = () => LOBBY_SETTINGS.match.pingCueLouderEveryNth || 5;

	const CROWN_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<path d="M3 17L5.5 8L9.5 12L12 6L14.5 12L18.5 8L21 17H3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>
		<path d="M4 19H20" stroke="currentColor" stroke-width="1.5"/>
	</svg>`;

	const READY_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<path d="M5 12.5L10 17L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
	</svg>`;

	const PENDING_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.5"/>
	</svg>`;

	const FOREVER_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<path d="M12 4V20M7 8H17M7 16H17" stroke="currentColor" stroke-width="1.5"/>
	</svg>`;

	const KICK_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2"/>
		<line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/>
	</svg>`;

	const DEFAULT_SETTINGS = () => ({
		reformation: false,
		bot_fill: 'none',
		time_bank: 60,
		turn_timer: 30,
		challenge_timer: 5,
		character_copies: 3,
		declared_coup: false,
		declared_assassinate: false,
		starting_coins: 2,
		coup_cost: 7,
		forced_coup_threshold: 10,
		income_coins: 1,
		foreign_aid_coins: 2,
	});

	/** @type {null | {
	 *   matchId: string,
	 *   joinCode: string,
	 *   name: string,
	 *   maxPlayers: number,
	 *   status: 'waiting' | 'in_progress',
	 *   localPlayerId: string,
	 *   players: Array<{
	 *     id: string,
	 *     displayName: string,
	 *     avatarUrl: string | null,
	 *     isHost: boolean,
	 *     ready: boolean,
	 *     readyForever: boolean,
	 *     isSpectator: boolean,
	 *     joinOrder: number,
	 *   }>,
	 *   settings: ReturnType<typeof DEFAULT_SETTINGS>,
	 *   pingCooldownUntil: number | null,
	 * }} */
	let state = null;
	let pingCountdownTimer = null;
	let namePollTimer = null;
	let mobileExpanded = false;
	let settingsChangeCount = 0;
	const NAME_POLL_MS = 2000;
	const MOBILE_MQ = window.matchMedia('(max-width: 720px)');

	const sidebar = document.getElementById('tribunal-sidebar');
	const sidebarChrome = sidebar?.querySelector('.tribunal-sidebar-chrome');
	const sidebarBackdrop = document.getElementById('tribunal-sidebar-backdrop');
	const playerListEl = document.getElementById('tribunal-player-list');
	const joinCodeEl = document.getElementById('tribunal-join-code');
	const lobbyContainer = document.getElementById('lobby-container');
	const btnLeave = document.getElementById('btn-leave-tribunal');
	const btnReady = document.getElementById('btn-ready-up');
	const btnReadyCaret = document.getElementById('btn-ready-caret');
	const btnReadyForever = document.getElementById('btn-ready-forever');
	const readyGroup = document.getElementById('tribunal-ready-group');
	const readyMenu = document.getElementById('ready-forever-menu');
	const btnPing = document.getElementById('btn-ping-unready');
	const btnStart = document.getElementById('btn-start-match');
	const btnSettings = document.getElementById('btn-open-match-settings');
	const btnCopyCode = document.getElementById('btn-copy-join-code');
	const btnExpand = document.getElementById('btn-tribunal-expand');
	const pregameControls = document.getElementById('tribunal-pregame-controls');
	const inTribunalNotice = document.getElementById('in-tribunal-notice');

	const settingsOverlay = document.getElementById('match-settings-overlay');
	const settingsForm = document.getElementById('match-settings-form');
	const settingsLockedNote = document.getElementById('match-settings-locked-note');
	const settingsSubtitle = document.getElementById('match-settings-subtitle');
	const advancedRules = document.getElementById('match-advanced-rules');
	const btnToggleAdvanced = document.getElementById('btn-toggle-advanced-rules');
	const pingAudio = document.getElementById('ping-cue');
	if (pingAudio) pingAudio.src = PING_CUE_SRC();

	// A native range input keeps the drag "captured" even once the pointer
	// leaves it, so releasing outside the settings box still resolves the
	// resulting click to the backdrop (nearest common ancestor of the
	// mousedown/mouseup targets) and would otherwise close the overlay
	// mid-drag. Track drags on any .match-settings-slider so that one
	// click can be swallowed. See the settingsOverlay click listener below.
	let suppressBackdropCloseOnce = false;
	document.querySelectorAll('.match-settings-slider').forEach((slider) => {
		['pointerdown', 'mousedown', 'touchstart'].forEach((evt) => {
			slider.addEventListener(evt, () => { suppressBackdropCloseOnce = true; });
		});
	});

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

	function isActive() {
		return state !== null;
	}

	function getState() {
		return state;
	}

	function localPlayer() {
		return state?.players.find((p) => p.id === state.localPlayerId) ?? null;
	}

	function viewerHasHostPowers() {
		const me = localPlayer();
		return Boolean(me && me.isHost);
	}

	function playerIsEffectivelyReady(p) {
		if (p.isSpectator) return true;
		if (p.readyForever) return true;
		return p.ready;
	}

	function matchCanStart() {
		if (!state || state.status !== 'waiting') return false;
		const required = state.players.filter((p) => !p.isSpectator);
		if (required.length < (LOBBY_SETTINGS.match?.minPlayers ?? 2)) return false;
		return required.every(playerIsEffectivelyReady);
	}

	function persistSession() {
		if (!state) {
			localStorage.removeItem(STORAGE_KEY());
			return;
		}
		localStorage.setItem(STORAGE_KEY(), JSON.stringify({
			matchId: state.matchId,
			joinCode: state.joinCode,
			name: state.name,
			maxPlayers: state.maxPlayers,
			localPlayerId: state.localPlayerId,
			status: state.status,
		}));
	}

	function isMobileLayout() {
		return MOBILE_MQ.matches;
	}

	function setMobileExpanded(expanded) {
		const isMinimizing = !expanded && mobileExpanded && isMobileLayout();
		if (isMinimizing) sidebar?.classList.add('is-minimizing');

		mobileExpanded = expanded;
		sidebar?.classList.toggle('is-expanded', expanded);
		btnExpand?.setAttribute('aria-expanded', String(expanded));
		sidebarBackdrop?.classList.toggle('is-visible', expanded);
		sidebarBackdrop?.classList.toggle('hidden', !expanded);
		sidebarBackdrop?.setAttribute('aria-hidden', expanded ? 'false' : 'true');
		if (!expanded) closeReadyMenu();

		if (isMinimizing) {
			// Let the sidebar container keep shrinking smoothly, but avatars
			// should snap straight to their collapsed grid slot instead of
			// visibly reflowing. Wait two frames so the new (collapsed) layout
			// has actually painted with transitions off before restoring them.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					sidebar?.classList.remove('is-minimizing');
				});
			});
		}
	}

	function applyGlobalLobbyLock(locked) {
		document.body.classList.toggle('in-tribunal', locked);
		lobbyContainer?.classList.toggle('in-tribunal', locked);
		btnLeave?.classList.toggle('hidden', !locked);
		inTribunalNotice?.classList.toggle('hidden', !locked);

		const createPanel = document.getElementById('create-match-panel');
		const joinPanel = document.getElementById('join-match-panel');
		if (locked) {
			createPanel?.classList.add('hidden');
			joinPanel?.classList.add('hidden');
		}
	}

	function setSidebarVisible(visible) {
		sidebar?.classList.toggle('hidden', !visible);
		sidebar?.setAttribute('aria-hidden', visible ? 'false' : 'true');
	}

	function syncSettingsForm() {
		if (!state || !settingsForm) return;
		const s = state.settings;
		const canEdit = viewerHasHostPowers() && state.status === 'waiting';

		settingsForm.classList.toggle('is-readonly', !canEdit);
		settingsLockedNote?.classList.toggle('hidden', state.status === 'waiting');
		if (settingsSubtitle) {
			settingsSubtitle.textContent = canEdit
				? 'Rules for this assembly.'
				: state.status === 'in_progress'
					? 'The match is underway. Statutes are sealed.'
					: 'Only the host may amend these statutes.';
		}

		const maxPlayersEl = document.getElementById('setting-max-players');
		const maxPlayersValueEl = document.getElementById('setting-max-players-value');
		if (maxPlayersEl && state) {
			const minCap = state.players.length;
			const maxCap = LOBBY_SETTINGS.match?.maxPlayers ?? 10;
			maxPlayersEl.min = String(minCap);
			maxPlayersEl.max = String(maxCap);
			maxPlayersEl.value = String(state.maxPlayers);
			maxPlayersEl.disabled = !canEdit;
			const pct = maxCap > minCap
				? ((state.maxPlayers - minCap) / (maxCap - minCap)) * 100
				: 100;
			maxPlayersEl.style.setProperty('--fill', `${pct}%`);
			if (maxPlayersValueEl) maxPlayersValueEl.textContent = String(state.maxPlayers);
		}

		const map = {
			reformation: 'setting-reformation',
			bot_fill: 'setting-bot-fill',
			time_bank: 'setting-time-bank',
			turn_timer: 'setting-turn-timer',
			challenge_timer: 'setting-challenge-timer',
			character_copies: 'setting-char-copies',
			declared_coup: 'setting-declared-coup',
			declared_assassinate: 'setting-declared-assassinate',
			starting_coins: 'setting-starting-coins',
			coup_cost: 'setting-coup-cost',
			forced_coup_threshold: 'setting-forced-coup-threshold',
			income_coins: 'setting-income-coins',
			foreign_aid_coins: 'setting-foreign-aid-coins',
		};

		Object.entries(map).forEach(([key, id]) => {
			const el = document.getElementById(id);
			if (!el) return;
			if (el.type === 'checkbox') {
				el.checked = Boolean(s[key]);
			} else {
				el.value = String(s[key]);
			}
			el.disabled = !canEdit;
		});
	}

	function renderPlayers() {
		if (!state || !playerListEl) return;

		const max = state.maxPlayers;
		const sorted = [...state.players].sort((a, b) => a.joinOrder - b.joinOrder);
		const canHost = viewerHasHostPowers();
		const matchLive = state.status === 'in_progress';

		// Mobile grid: prefer ~4–5 avatars per row when collapsed.
		const cols = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(max))));
		playerListEl.style.setProperty('--tribunal-cols', String(cols));
		sidebar?.style.setProperty('--tribunal-cols', String(cols));

		playerListEl.innerHTML = '';

		for (let i = 0; i < max; i++) {
			const player = sorted[i] ?? null;
			const li = document.createElement('li');
			li.className = 'tribunal-player-slot' + (player ? '' : ' is-empty');

			if (!player) {
				li.innerHTML = `<div class="tribunal-avatar empty" title="Empty seat" aria-label="Empty seat"></div>
					<div class="tribunal-player-meta"><span class="tribunal-player-name">Empty seat</span></div>`;
				playerListEl.appendChild(li);
				continue;
			}

			const avatarSrc = player.avatarUrl || '/static/img/default-avatar.png';
			const effectivelyReady = playerIsEffectivelyReady(player);
			const showKick = canHost && !matchLive && player.id !== state.localPlayerId;
			const showPromote = canHost && !matchLive && !player.isHost
				&& player.id !== state.localPlayerId;
			const readyClass = matchLive
				? ''
				: (effectivelyReady ? ' is-ready' : ' is-unready');

			let readyTitle = 'This player is not ready';
			if (player.readyForever) readyTitle = 'This player is ready forever';
			else if (effectivelyReady) readyTitle = 'This player is ready';

			li.innerHTML = `
				<div class="tribunal-avatar${readyClass}" title="${escapeAttr(player.displayName)}">
					<img src="${escapeAttr(avatarSrc)}" alt="">
				</div>
				<div class="tribunal-player-meta">
					${player.isHost ? `<span class="tribunal-tip tribunal-host-badge" data-tip="This player is host.">${CROWN_SVG}</span>` : ''}
					<span class="tribunal-player-name">${escapeHtml(player.displayName)}</span>
					${!matchLive ? `<span class="tribunal-tip tribunal-ready-badge ${effectivelyReady ? 'is-ready' : 'is-unready'}" data-tip="${escapeAttr(readyTitle)}">${effectivelyReady ? READY_SVG : PENDING_SVG}</span>` : ''}
					${player.readyForever && !matchLive ? `<span class="tribunal-tip tribunal-forever-badge" data-tip="This player is ready forever">${FOREVER_SVG}</span>` : ''}
					${showPromote ? `<button type="button" class="tribunal-promote-btn is-visible" data-promote-id="${escapeAttr(player.id)}" title="Promote to host">Host</button>` : ''}
					${showKick ? `<button type="button" class="tribunal-kick-btn is-visible" data-kick-id="${escapeAttr(player.id)}" title="Remove player" aria-label="Remove ${escapeAttr(player.displayName)}">${KICK_SVG}</button>` : ''}
				</div>
			`;
			playerListEl.appendChild(li);
		}

		playerListEl.querySelectorAll('[data-kick-id]').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				removePlayer(btn.getAttribute('data-kick-id'));
			});
		});
		playerListEl.querySelectorAll('[data-promote-id]').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				promoteToHost(btn.getAttribute('data-promote-id'));
			});
		});
	}

	function renderControls() {
		if (!state) return;
		const me = localPlayer();
		const canHost = viewerHasHostPowers();
		const waiting = state.status === 'waiting';
		const unreadyCount = state.players.filter((p) => !p.isSpectator && !playerIsEffectivelyReady(p)).length;
		const onCooldown = state.pingCooldownUntil && Date.now() < state.pingCooldownUntil;

		pregameControls?.classList.toggle('hidden', !waiting);

		if (readyGroup) readyGroup.classList.toggle('hidden', !waiting);

		if (btnReady && me) {
			btnReady.classList.toggle('is-ready', me.ready || me.readyForever);
			btnReady.setAttribute('aria-pressed', String(me.ready || me.readyForever));
			btnReady.textContent = me.readyForever
				? 'Ready Forever'
				: me.ready
					? 'Unready'
					: 'Ready Up';
		}

		if (btnReadyForever && me) {
			btnReadyForever.textContent = me.readyForever ? 'Clear Ready Forever' : 'Ready Forever';
		}

		if (btnPing) {
			btnPing.classList.toggle('hidden', !canHost || !waiting);
			const noUnready = unreadyCount === 0;
			btnPing.disabled = false; // keep clickable so cooldown clicks can toast
			btnPing.classList.toggle('is-blocked', noUnready || Boolean(onCooldown));
			btnPing.setAttribute('aria-disabled', String(noUnready || Boolean(onCooldown)));
			if (onCooldown) {
				const secs = Math.ceil((state.pingCooldownUntil - Date.now()) / 1000);
				btnPing.textContent = `Ping (${secs}s)`;
			} else {
				btnPing.textContent = 'Ping Unready';
			}
		}

		if (btnStart) {
			btnStart.classList.toggle('hidden', !canHost || !waiting);
			const canStart = matchCanStart();
			btnStart.disabled = false; // keep clickable so we can toast why it's blocked
			btnStart.classList.toggle('is-blocked', !canStart);
			btnStart.setAttribute('aria-disabled', String(!canStart));
		}

		if (joinCodeEl) joinCodeEl.textContent = `Code: ${state.joinCode}`;
	}

	function render() {
		if (!state) {
			setSidebarVisible(false);
			setMobileExpanded(false);
			applyGlobalLobbyLock(false);
			return;
		}
		setSidebarVisible(true);
		applyGlobalLobbyLock(true);
		renderPlayers();
		renderControls();
		syncSettingsForm();
	}

	function enter(payload, opts = {}) {
		const user = LobbySession.get() || {};
		const localId = payload.localPlayerId || user.username || `local-${Date.now()}`;
		const existingPlayers = payload.players || [{
			id: localId,
			displayName: user.displayName || user.username || 'Citizen',
			avatarUrl: user.avatarUrl || null,
			isHost: true,
			ready: false,
			readyForever: false,
			isSpectator: false,
			joinOrder: 0,
		}];

		state = {
			matchId: payload.matchId,
			joinCode: payload.joinCode,
			name: payload.name || 'Tribunal',
			maxPlayers: payload.maxPlayers || LOBBY_SETTINGS.match.defaultMaxPlayers,
			status: payload.status || 'waiting',
			localPlayerId: localId,
			players: existingPlayers,
			settings: { ...DEFAULT_SETTINGS(), ...(payload.settings || {}) },
			pingCooldownUntil: null,
			pingCount: 0,
		};

		persistSession();
		setMobileExpanded(false);
		settingsChangeCount = 0;
		startNamePolling();
		render();
		if (!opts.silent) {
			Toast.show(ToastMessages.matches.enteredLobby(state.name), 'success');
		}
	}

	function leave() {
		if (!state) return;
		console.log(`Leave Tribunal stub: match=${state.matchId}`);
		state = null;
		persistSession();
		closeMatchSettings();
		closeReadyMenu();
		stopNamePolling();
		clearInterval(pingCountdownTimer);
		pingCountdownTimer = null;
		setMobileExpanded(false);
		settingsChangeCount = 0;
		render();
		Toast.show(ToastMessages.matches.leftLobby(), 'info');
	}

	// ---- Stubs / API surface -------------------------------------------------

	function removePlayer(playerId) {
		if (!state || !viewerHasHostPowers()) return;
		console.log(`removePlayer(${playerId}) stub`);
		state.players = state.players.filter((p) => p.id !== playerId);
		// Host succession: if the primary host left, promote next by join order.
		ensureHostExists();
		render();
		Toast.show(ToastMessages.matches.playerRemoved(), 'info');
	}

	function ensureHostExists() {
		if (!state) return;
		const hasHost = state.players.some((p) => p.isHost);
		if (hasHost || state.players.length === 0) return;
		const next = [...state.players].sort((a, b) => a.joinOrder - b.joinOrder)[0];
		next.isHost = true;
		Toast.show(ToastMessages.matches.hostTransferred(next.displayName), 'info');
	}

	/** Called when the local user (or a simulated peer) leaves; triggers host handoff. */
	function handlePlayerLeave(playerId) {
		if (!state) return;
		const leaving = state.players.find((p) => p.id === playerId);
		state.players = state.players.filter((p) => p.id !== playerId);
		if (leaving?.isHost) ensureHostExists();
		if (playerId === state.localPlayerId) {
			leave();
			return;
		}
		render();
	}

	/** Transfer sole host to another player; former host becomes a regular player. */
	function promoteToHost(playerId) {
		if (!state || !viewerHasHostPowers()) return;
		const target = state.players.find((p) => p.id === playerId);
		if (!target || target.isHost) return;
		console.log(`promoteToHost(${playerId}) stub`);
		state.players.forEach((p) => { p.isHost = false; });
		target.isHost = true;
		render();
		Toast.show(ToastMessages.matches.promotedHost(target.displayName), 'success');
	}

	function sendPingToUnready() {
		if (!state || !viewerHasHostPowers()) return;

		if (state.pingCooldownUntil && Date.now() < state.pingCooldownUntil) {
			const secs = Math.ceil((state.pingCooldownUntil - Date.now()) / 1000);
			Toast.show(ToastMessages.matches.pingOnCooldown(secs), 'warning');
			return;
		}

		const unready = state.players.filter((p) => !p.isSpectator && !playerIsEffectivelyReady(p));
		if (unready.length === 0) return;

		console.log('sendPingToUnready() stub', unready.map((p) => p.id));

		state.pingCount = (state.pingCount || 0) + 1;
		const isLouderPing = state.pingCount % PING_CUE_LOUDER_EVERY_NTH() === 0;

		// Local simulation: if *we* are unready, play cue + toast.
		const me = localPlayer();
		if (me && !playerIsEffectivelyReady(me)) {
			try {
				if (pingAudio) {
					pingAudio.src = isLouderPing ? PING_CUE_LOUDER_SRC() : PING_CUE_SRC();
					pingAudio.currentTime = 0;
					pingAudio.play();
				}
			} catch (_) { /* autoplay may block */ }
			Toast.show(ToastMessages.matches.pingedUnready(), 'warning');
		} else {
			Toast.show(ToastMessages.matches.pingSent(unready.length), 'info');
		}

		state.pingCooldownUntil = Date.now() + PING_COOLDOWN_MS();
		renderControls();
		clearInterval(pingCountdownTimer);
		pingCountdownTimer = setInterval(() => {
			if (!state?.pingCooldownUntil || Date.now() >= state.pingCooldownUntil) {
				clearInterval(pingCountdownTimer);
				pingCountdownTimer = null;
				if (state) state.pingCooldownUntil = null;
				renderControls();
				return;
			}
			renderControls();
		}, 250);
	}

	function onSettingsChange(newSettings) {
		if (!state) return;

		const prevSettings = JSON.stringify(state.settings);
		const prevMaxPlayers = state.maxPlayers;
		const { max_players: maxPlayersRaw, ...restSettings } = newSettings;
		const nextSettings = { ...state.settings, ...restSettings };
		const nextMaxPlayers = maxPlayersRaw !== undefined ? Number(maxPlayersRaw) : state.maxPlayers;
		const minCap = state.players.length;
		const maxCap = LOBBY_SETTINGS.match?.maxPlayers ?? 10;
		const clampedMaxPlayers = Math.min(maxCap, Math.max(minCap, nextMaxPlayers));

		if (JSON.stringify(nextSettings) === prevSettings && clampedMaxPlayers === prevMaxPlayers) return;

		console.log('onSettingsChange stub', { ...restSettings, max_players: clampedMaxPlayers });
		state.settings = nextSettings;
		if (clampedMaxPlayers !== prevMaxPlayers) {
			state.maxPlayers = clampedMaxPlayers;
			persistSession();
		}

		// Ready resets for everyone except Ready Forever.
		state.players.forEach((p) => {
			if (!p.readyForever) p.ready = false;
		});

		render();
		bumpSettingsToast();
	}

	/** One aggregating toast for statute edits — never stacks duplicates. */
	function bumpSettingsToast() {
		settingsChangeCount += 1;
		const message = ToastMessages.matches.settingsUpdated(settingsChangeCount);

		Toast.show(message, 'info', {
			key: 'settings-changed',
			onDismiss: () => { settingsChangeCount = 0; },
		});

		// Belt-and-suspenders: if anything still stacked (stale cache / race),
		// keep only the newest settings toast.
		const all = [...document.querySelectorAll('.medieval-toast[data-toast-key="settings-changed"]')];
		if (all.length > 1) {
			all.slice(0, -1).forEach((el) => el.remove());
			const last = all[all.length - 1];
			const msgEl = last?.querySelector('.toast-message');
			if (msgEl) msgEl.textContent = message;
		}
	}

	/** Pull latest display names (local from LobbySession; remotes via stubbed request). */
	function refreshPlayerNames() {
		if (!state) return;
		let changed = false;

		const user = LobbySession.get();
		const me = localPlayer();
		if (me && user) {
			if (user.displayName && me.displayName !== user.displayName) {
				me.displayName = user.displayName;
				changed = true;
			}
			if (user.avatarUrl !== undefined && me.avatarUrl !== user.avatarUrl) {
				me.avatarUrl = user.avatarUrl || null;
				changed = true;
			}
		}

		// Stub: request each remote player's current display name from the server/WS.
		state.players.forEach((p) => {
			if (p.id === state.localPlayerId) return;
			console.log(`refreshPlayerNames stub: GET display name for ${p.id}`);
			// Real implementation would apply the response here.
		});

		if (changed) renderPlayers();
	}

	function startNamePolling() {
		stopNamePolling();
		refreshPlayerNames();
		namePollTimer = setInterval(refreshPlayerNames, NAME_POLL_MS);
	}

	function stopNamePolling() {
		if (namePollTimer) {
			clearInterval(namePollTimer);
			namePollTimer = null;
		}
	}

	function toggleReady(opts = {}) {
		const me = localPlayer();
		if (!me || !state || state.status !== 'waiting') return;

		if (opts.forever) {
			me.readyForever = !me.readyForever;
			if (me.readyForever) me.ready = true;
		} else {
			me.readyForever = false;
			me.ready = !me.ready;
		}

		console.log(`readyState -> ${me.ready ? 'ready' : 'unready'} (readyForever=${me.readyForever})`);
		closeReadyMenu();
		render();
	}

	function openReadyMenu() {
		readyMenu?.classList.remove('hidden');
		btnReadyCaret?.setAttribute('aria-expanded', 'true');
	}

	function closeReadyMenu() {
		readyMenu?.classList.add('hidden');
		btnReadyCaret?.setAttribute('aria-expanded', 'false');
	}

	function toggleReadyMenu() {
		if (!readyMenu) return;
		if (readyMenu.classList.contains('hidden')) openReadyMenu();
		else closeReadyMenu();
	}

	function startMatch() {
		if (!state || !viewerHasHostPowers()) return;

		if (!matchCanStart()) {
			const seated = state.players.filter((p) => !p.isSpectator);
			if (seated.length < (LOBBY_SETTINGS.match?.minPlayers ?? 2)) {
				Toast.show(ToastMessages.matches.cannotStartTooFew(), 'warning');
			} else {
				Toast.show(ToastMessages.matches.cannotStartNotReady(), 'warning');
			}
			return;
		}

		console.log(`startMatch stub: match=${state.matchId}`);
		state.status = 'in_progress';
		persistSession();
		closeMatchSettings();
		render();
		Toast.show(ToastMessages.matches.matchStarted(), 'success');
	}

	function openMatchSettings() {
		syncSettingsForm();
		settingsOverlay?.classList.add('visible');
		settingsOverlay?.setAttribute('aria-hidden', 'false');
	}

	function closeMatchSettings() {
		settingsOverlay?.classList.remove('visible');
		settingsOverlay?.setAttribute('aria-hidden', 'true');
	}

	function readSettingsFromForm() {
		const copiesRaw = document.getElementById('setting-char-copies')?.value ?? '3';
		const maxPlayersRaw = document.getElementById('setting-max-players')?.value;

		const startingCoins = Number(document.getElementById('setting-starting-coins')?.value ?? 2);
		const coupCost = Number(document.getElementById('setting-coup-cost')?.value ?? 7);
		const incomeCoins = Number(document.getElementById('setting-income-coins')?.value ?? 1);
		const foreignAidCoins = Number(document.getElementById('setting-foreign-aid-coins')?.value ?? 2);

		// Forced-coup threshold must never sit below the cost of a coup,
		// so clamp here to keep the form from submitting a contradictory pair.
		const forcedCoupRaw = Number(document.getElementById('setting-forced-coup-threshold')?.value ?? 10);
		const forcedCoupThreshold = Math.max(coupCost, forcedCoupRaw);

		return {
			reformation: document.getElementById('setting-reformation')?.checked ?? false,
			bot_fill: document.getElementById('setting-bot-fill')?.value ?? 'none',
			time_bank: Number(document.getElementById('setting-time-bank')?.value ?? 60),
			turn_timer: Number(document.getElementById('setting-turn-timer')?.value ?? 30),
			challenge_timer: Number(document.getElementById('setting-challenge-timer')?.value ?? 5),
			character_copies: copiesRaw === 'inf' ? 'inf' : Number(copiesRaw),
			declared_coup: document.getElementById('setting-declared-coup')?.checked ?? false,
			declared_assassinate: document.getElementById('setting-declared-assassinate')?.checked ?? false,
			starting_coins: startingCoins,
			coup_cost: coupCost,
			forced_coup_threshold: forcedCoupThreshold,
			income_coins: incomeCoins,
			foreign_aid_coins: foreignAidCoins,
			max_players: maxPlayersRaw !== undefined ? Number(maxPlayersRaw) : undefined,
		};
	}

	/** On app init: restore sidebar if a stored tribunal session exists. */
	function checkForActiveSession() {
		let stored;
		try {
			stored = JSON.parse(localStorage.getItem(STORAGE_KEY()) || 'null');
		} catch {
			stored = null;
		}
		if (!stored?.matchId || !stored?.joinCode) return false;

		console.log('checkForActiveSession() — rejoining', stored.matchId);
		const user = LobbySession.get() || {};
		const localId = stored.localPlayerId || user.username || 'local-rejoin';

		// Stubbed rejoin payload — real flow would fetch lobby state over WS/REST.
		enter({
			matchId: stored.matchId,
			joinCode: stored.joinCode,
			name: stored.name || 'Tribunal',
			maxPlayers: stored.maxPlayers || LOBBY_SETTINGS.match.defaultMaxPlayers,
			status: stored.status || 'waiting',
			localPlayerId: localId,
			players: [
				{
					id: localId,
					displayName: user.displayName || user.username || 'Citizen',
					avatarUrl: user.avatarUrl || null,
					isHost: true,
					ready: false,
					readyForever: false,
					isSpectator: false,
					joinOrder: 0,
				},
				{
					id: 'peer-stub-1',
					displayName: 'Awaiting Officer',
					avatarUrl: null,
					isHost: false,
					ready: false,
					readyForever: false,
					isSpectator: false,
					joinOrder: 1,
				},
			],
		}, { silent: true });
		return true;
	}

	function escapeHtml(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function escapeAttr(str) {
		return escapeHtml(str).replace(/'/g, '&#39;');
	}

	// ---- Wire DOM ------------------------------------------------------------

	bindTouchFriendlyClick(btnLeave, () => leave());
	bindTouchFriendlyClick(btnReady, () => toggleReady());
	bindTouchFriendlyClick(btnReadyCaret, (e) => {
		e.stopPropagation();
		toggleReadyMenu();
	});
	bindTouchFriendlyClick(btnReadyForever, (e) => {
		e.stopPropagation();
		toggleReady({ forever: true });
	});
	document.addEventListener('click', (e) => {
		if (!readyGroup?.contains(e.target)) closeReadyMenu();
	});
	bindTouchFriendlyClick(btnPing, () => sendPingToUnready());
	bindTouchFriendlyClick(btnStart, () => startMatch());
	bindTouchFriendlyClick(btnSettings, () => openMatchSettings());
	bindTouchFriendlyClick(document.getElementById('btn-match-settings-close'), () => closeMatchSettings());

	settingsOverlay?.addEventListener('click', (e) => {
		if (suppressBackdropCloseOnce) {
			suppressBackdropCloseOnce = false;
			return;
		}
		if (e.target === settingsOverlay) closeMatchSettings();
	});

	btnToggleAdvanced?.addEventListener('click', () => {
		const open = advancedRules?.classList.toggle('hidden') === false;
		btnToggleAdvanced.setAttribute('aria-expanded', String(open));
	});

	function handleSettingsFormUpdate() {
		if (!state || !viewerHasHostPowers() || state.status !== 'waiting') return;
		onSettingsChange(readSettingsFromForm());
	}

	// Live-sync settings on change (host/co-host only; form is readonly otherwise).
	// For the max-players range, 'change' only fires on release (mouseup/
	// keyup/touchend), which is exactly when we want to commit, since
	// resetting ready states and bumping the toast on every 'input' tick
	// while dragging would be disruptive. The label and fill still update
	// live on 'input' below, purely cosmetic, no settings commit.
	settingsForm?.addEventListener('change', handleSettingsFormUpdate);
	settingsForm?.addEventListener('input', (e) => {
		const maxPlayersEl = document.getElementById('setting-max-players');
		const maxPlayersValueEl = document.getElementById('setting-max-players-value');
		if (e.target === maxPlayersEl) {
			if (maxPlayersValueEl) maxPlayersValueEl.textContent = maxPlayersEl.value;
			const minCap = Number(maxPlayersEl.min);
			const maxCap = Number(maxPlayersEl.max);
			const val = Number(maxPlayersEl.value);
			const pct = maxCap > minCap ? ((val - minCap) / (maxCap - minCap)) * 100 : 100;
			maxPlayersEl.style.setProperty('--fill', `${pct}%`);
		}
	});

	bindTouchFriendlyClick(btnCopyCode, async () => {
		if (!state?.joinCode) return;
		try {
			await navigator.clipboard.writeText(state.joinCode);
			Toast.show(ToastMessages.matches.codeCopied(), 'success');
		} catch {
			Toast.show(ToastMessages.matches.codeCopyFailed(), 'warning');
		}
	});

	bindTouchFriendlyClick(btnExpand, (e) => {
		e.stopPropagation();
		if (!isMobileLayout()) return;
		setMobileExpanded(!mobileExpanded);
	});

	bindTouchFriendlyClick(sidebarBackdrop, () => {
		if (isMobileLayout() && mobileExpanded) setMobileExpanded(false);
	});

	bindTouchFriendlyClick(sidebarChrome, (e) => {
		if (!isMobileLayout() || mobileExpanded) return;
		if (e.target.closest('button, a, input, select, textarea, label')) return;
		setMobileExpanded(true);
	});

	document.addEventListener('click', (e) => {
		if (!isMobileLayout() || !mobileExpanded || !state) return;
		if (sidebar?.contains(e.target) || sidebarBackdrop?.contains(e.target)) return;
		if (settingsOverlay?.classList.contains('visible')) return;
		setMobileExpanded(false);
	}, true);

	// Desktop expand is CSS :hover only. Blur any focused control on mouseleave
	// so a prior click can't keep the panel feeling "stuck" open.
	sidebar?.addEventListener('mouseleave', () => {
		if (!window.matchMedia('(min-width: 721px)').matches) return;
		sidebar.classList.remove('is-expanded');
		const active = document.activeElement;
		if (active && sidebar.contains(active) && typeof active.blur === 'function') {
			active.blur();
		}
		closeReadyMenu();
	});

	MOBILE_MQ.addEventListener('change', () => {
		if (!isMobileLayout() && mobileExpanded) setMobileExpanded(false);
	});

	// Mirror local profile edits into the sidebar immediately.
	LobbySession.subscribe((user) => {
		if (!state || !user) return;
		const me = localPlayer();
		if (!me) return;
		let changed = false;
		if (user.displayName && me.displayName !== user.displayName) {
			me.displayName = user.displayName;
			changed = true;
		}
		if (user.avatarUrl !== undefined && me.avatarUrl !== user.avatarUrl) {
			me.avatarUrl = user.avatarUrl || null;
			changed = true;
		}
		if (changed) renderPlayers();
	});

	// Simulate host leave → succession for local testing:
	// window.TribunalLobby.handlePlayerLeave(hostId)

	return {
		isActive,
		getState,
		enter,
		leave,
		checkForActiveSession,
		removePlayer,
		promoteToHost,
		sendPingToUnready,
		onSettingsChange,
		handlePlayerLeave,
		matchCanStart,
		startMatch,
		refreshPlayerNames,
	};
})();