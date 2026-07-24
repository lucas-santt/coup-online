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
	const PING_COOLDOWN_MS = () => LOBBY_SETTINGS.match.pingCooldownMs;
	const PING_CUE_SRC = () => LOBBY_SETTINGS.match.pingCueSrc;
	const PING_CUE_LOUDER_SRC = () => LOBBY_SETTINGS.match.pingCueLouderSrc;
	const PING_CUE_LOUDER_EVERY_NTH = () => LOBBY_SETTINGS.match.pingCueLouderEveryNth;

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
		assassinate_cost: 3,
		income_coins: 1,
		foreign_aid_coins: 2,
		extort_coins: 2,
		tax_coins: 3,
		exchange_draw_cards: 2,
		time_bank_count: 2,
		cards_per_player: 2,
	});

	// 5 base character types (Ambassador, Assassin, Captain, Contessa, Duke)
	// -- mirrors backend/models/match.py's BASE_CARD_TYPES. Used by
	// minCharacterCopiesFor() below, the frontend's best-effort mirror of
	// validate_settings_patch()'s deck-size cross-field rule; the backend
	// check is the real gate, this is only here so the form doesn't show a
	// value the server is about to silently override.
	const BASE_CARD_TYPES = 5;

	// character_copies tops out at 7 finite copies (see
	// constants.MATCH_SETTINGS_SCHEMA) -- the <select> in index.html only
	// lists 3-7 + inf. A deck that would need more than that to deal
	// cards_per_player to every seat plus an exchange draw goes infinite
	// (-1, drawn with replacement) instead of auto-bumping past 7.
	const MAX_FINITE_CHARACTER_COPIES = 7;

	function minCharacterCopiesFor(cardsPerPlayer, maxPlayers, exchangeDrawCards) {
		const required = cardsPerPlayer * maxPlayers + exchangeDrawCards;
		const minCopies = Math.floor(required / BASE_CARD_TYPES) + 1;
		return minCopies > MAX_FINITE_CHARACTER_COPIES ? -1 : minCopies;
	}

	// The fields tucked away inside the "Advanced / House Rules" fold. If
	// any of these has been pushed off its standard value, a warning icon
	// is shown next to the toggle (see hasNonDefaultAdvancedSettings()
	// below, applied in syncSettingsForm() and the form's 'input' handler)
	// so a folded panel can't quietly hide a wild rule from someone who
	// hasn't opened it yet.
	const ADVANCED_SETTINGS_KEYS = [
		'starting_coins',
		'coup_cost',
		'forced_coup_threshold',
		'income_coins',
		'foreign_aid_coins',
		'tax_coins',
		'assassinate_cost',
		'extort_coins',
		'exchange_draw_cards',
		'cards_per_player',
	];

	function hasNonDefaultAdvancedSettings(settings) {
		const defaults = DEFAULT_SETTINGS();
		return ADVANCED_SETTINGS_KEYS.some((key) => settings[key] !== defaults[key]);
	}

	// ---- Per-setting "differs from default" markers ---------------------
	// A small asterisk after any settings label whose value has been
	// pushed off the standard ruleset, tribunal-tip-tooltipped with what
	// that default actually is — a folded "Advanced" section already gets
	// its own warning icon (hasNonDefaultAdvancedSettings above), but a
	// deviation in an always-visible setting (e.g. Turn Timer, Time Bank)
	// was otherwise just as easy to miss.

	const BOT_FILL_LABELS = {
		none: 'None',
		fill: 'Fill Empty Seats',
		solo: 'Solo Practice (Full Bots)',
	};

	function formatSettingDefaultForDisplay(key, value) {
		if (key === 'character_copies') return value === -1 ? '∞ (unlimited)' : String(value);
		if (key === 'bot_fill') return BOT_FILL_LABELS[value] || String(value);
		if (typeof value === 'boolean') return value ? 'On' : 'Off';
		return String(value);
	}

	/** Builds the (initially hidden) asterisk markup once per settings
	 * input, right inside that input's <label for="...">. Idempotent —
	 * safe to call more than once, though it only ever needs to run at
	 * module init since the form's inputs are static markup.
	 *
	 * Each marker's tooltip is wired to the same fixed-position mechanism
	 * as #advanced-rules-warning-icon (see showFixedTooltip()/
	 * hideFixedTooltip() below) rather than the shared .tribunal-tip::after
	 * pseudo-element — it sits inside the same clipped #match-settings-form
	 * scrolling container, so it needs to float outside it the same way. */
	function ensureSettingDiffMarkers() {
		document.querySelectorAll('#match-settings-form [data-setting]').forEach((input) => {
			// Any player count is a legitimate choice — there's no "correct"
			// default to flag, so max_players never gets a marker at all.
			if (!input.id || input.dataset.setting === 'max_players') return;
			const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
			if (!label || label.querySelector('.setting-diff-asterisk')) return;
			const marker = document.createElement('span');
			marker.className = 'setting-diff-asterisk tribunal-tip hidden';
			marker.setAttribute('aria-hidden', 'true');
			marker.textContent = '*';
			marker.addEventListener('mouseenter', () => showFixedTooltip(marker));
			marker.addEventListener('mouseleave', hideFixedTooltip);
			marker.addEventListener('focus', () => showFixedTooltip(marker));
			marker.addEventListener('blur', hideFixedTooltip);
			label.appendChild(marker);
		});
	}

	/** settingsSource is either state.settings (committed) or the live
	 * output of readSettingsFromForm() (mid-edit). max_players is excluded
	 * entirely (see ensureSettingDiffMarkers above) — there's no marker for
	 * it to refresh. */
	function refreshSettingDiffMarkers(settingsSource) {
		const defaults = DEFAULT_SETTINGS();
		document.querySelectorAll('#match-settings-form [data-setting]').forEach((input) => {
			const key = input.dataset.setting;
			if (key === 'max_players') return;
			const defaultValue = defaults[key];
			if (defaultValue === undefined || !input.id) return;
			const marker = document.querySelector(`label[for="${CSS.escape(input.id)}"] .setting-diff-asterisk`);
			if (!marker) return;

			const currentValue = settingsSource[key];
			const differs = currentValue !== undefined && currentValue !== defaultValue;
			marker.classList.toggle('hidden', !differs);
			marker.setAttribute('aria-hidden', String(!differs));
			if (differs) {
				marker.dataset.tip = `By default this is set to ${formatSettingDefaultForDisplay(key, defaultValue)}`;
			}
		});
	}

	ensureSettingDiffMarkers();

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
	 *   connected: boolean,
	 * }} */
	let state = null;
	let pingCountdownTimer = null;
	let mobileExpanded = false;
	let settingsChangeCount = 0;
	const MOBILE_MQ = window.matchMedia('(max-width: 720px)');

	// ---- Settings form debounce / retry ---------------------------------------
	// Native number-input spinner arrows fire a 'change' event per tick, and
	// holding one down can fire dozens in under a second — each used to hit
	// the wire immediately, tripping the server's spam-floor cooldown
	// (SETTINGS_ON_COOLDOWN) and resetting everyone's ready state on every
	// tick. Instead: accumulate for SETTINGS_DEBOUNCE_MS of silence, then send
	// one full read of the form — onSettingsChange() already diffs that
	// against state.settings and no-ops if nothing actually changed (e.g. a
	// toggle flipped on and back off inside the debounce window).
	const SETTINGS_DEBOUNCE_MS = 300;
	let settingsDebounceTimer = null;
	let settingsRetryTimer = null;

	function clearSettingsTimers() {
		clearTimeout(settingsDebounceTimer);
		clearTimeout(settingsRetryTimer);
		settingsDebounceTimer = null;
		settingsRetryTimer = null;
	}

	// ---- WebSocket connection state -------------------------------------------
	// One socket per tribunal session, opened by enter() right after a
	// successful create/join, closed by leave(). Server pushes a full
	// state_snapshot immediately on connect/reconnect — every render before
	// that snapshot arrives is necessarily a "connecting..." placeholder,
	// never fabricated roster data (see connectSocket()/_applySnapshot()).
	let socket = null;
	let socketMatchId = null;
	let intentionalClose = false;
	let reconnectTimer = null;
	let reconnectAttempts = 0;
	const RECONNECT_BASE_DELAY_MS = 1000;
	const RECONNECT_MAX_DELAY_MS = 8000;

	// request_id -> { resolve, reject, timeout }, for client messages that
	// expect a definite ack/error per the WS contract (update_settings,
	// set_ready, promote_host, kick_player, start_match, ping_unready).
	const pendingRequests = new Map();
	let requestCounter = 0;
	const REQUEST_TIMEOUT_MS = 8000;

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
	const advancedWarningIcon = document.getElementById('advanced-rules-warning-icon');
	const pingAudio = document.getElementById('ping-cue');
	if (pingAudio) pingAudio.src = PING_CUE_SRC();

	// The house-rules warning icon's tooltip (and, via
	// ensureSettingDiffMarkers() above, each settings-diff asterisk's) is
	// rendered as a real, body-appended fixed-position element instead of
	// the shared .tribunal-tip::after pseudo-element (see
	// lobby-sidebar.css) — both sit inside the settings form's scrolling
	// container (#match-settings-form, overflow-y: auto), and an
	// absolutely-positioned pseudo-element there counts toward that
	// container's scrollable overflow, which is what was clipping the
	// asterisk's tip against the container's top edge and risked forcing a
	// horizontal scrollbar for either one. Positioned via JS on
	// hover/focus so it floats completely outside that container instead.
	// See .setting-diff-asterisk.tribunal-tip::after,
	// .advanced-rules-warning-icon.tribunal-tip::after { content: none }
	// in lobby-sidebar.css, which turns off the normal pseudo-element
	// tooltip for both.
	let fixedTipEl = null;
	function showFixedTooltip(anchor) {
		if (!anchor?.dataset.tip) return;
		if (!fixedTipEl) {
			fixedTipEl = document.createElement('div');
			fixedTipEl.className = 'fixed-tribunal-tip';
			document.body.appendChild(fixedTipEl);
		}
		fixedTipEl.textContent = anchor.dataset.tip;
		const rect = anchor.getBoundingClientRect();
		fixedTipEl.style.left = `${rect.left + rect.width / 2}px`;
		fixedTipEl.style.top = `${rect.top - 8}px`;
		fixedTipEl.classList.add('visible');
	}
	function hideFixedTooltip() {
		fixedTipEl?.classList.remove('visible');
	}
	if (advancedWarningIcon) {
		advancedWarningIcon.addEventListener('mouseenter', () => showFixedTooltip(advancedWarningIcon));
		advancedWarningIcon.addEventListener('mouseleave', hideFixedTooltip);
		advancedWarningIcon.addEventListener('focus', () => showFixedTooltip(advancedWarningIcon));
		advancedWarningIcon.addEventListener('blur', hideFixedTooltip);
	}

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
		// No minimum-headcount gate: per the project owner's explicit
		// override, the host can start with as few players as are seated —
		// the backend (handle_start_match) enforces the same rule, this just
		// mirrors it for responsive button state.
		if (required.length === 0) return false;
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

	// ---- WebSocket engine ------------------------------------------------------

	function wsUrl(matchId) {
		const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
		return `${scheme}${window.location.host}/api/ws/matches/${encodeURIComponent(matchId)}`;
	}

	/** Opens (or re-opens, on reconnect) the tribunal socket for matchId. */
	function connectSocket(matchId) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
		intentionalClose = false;
		socketMatchId = matchId;

		let ws;
		try {
			ws = new WebSocket(wsUrl(matchId));
		} catch (err) {
			scheduleReconnect();
			return;
		}
		socket = ws;

		ws.addEventListener('open', () => {
			reconnectAttempts = 0;
			if (state) {
				state.connected = true;
				renderControls();
			}
		});

		ws.addEventListener('message', (event) => {
			let message;
			try {
				message = JSON.parse(event.data);
			} catch (err) {
				return;
			}
			handleServerMessage(message);
		});

		ws.addEventListener('close', (event) => {
			if (socket !== ws) return; // a newer socket has already replaced this one
			socket = null;
			if (state) {
				state.connected = false;
				renderControls();
			}
			rejectAllPending({ error_code: 'CONNECTION_LOST', detail: 'Connection to the tribunal was lost.' });

			if (intentionalClose) return;

			// Policy-violation close (1008): the server refused the connection
			// outright (match doesn't exist, or we're not seated in it). No
			// point reconnecting into the same refusal.
			if (event.code === 1008) {
				Toast.show(ToastMessages.connectionLost(), 'error');
				leave();
				return;
			}

			scheduleReconnect();
		});

		ws.addEventListener('error', () => {
			// The close handler above fires right after this and does the
			// actual reconnect scheduling — nothing additional to do here.
		});
	}

	function scheduleReconnect() {
		if (!socketMatchId || intentionalClose) return;
		clearTimeout(reconnectTimer);
		const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts);
		reconnectAttempts += 1;
		if (reconnectAttempts === 1) {
			Toast.show(ToastMessages.connectionLost(), 'network');
		}
		reconnectTimer = window.setTimeout(() => {
			if (socketMatchId) connectSocket(socketMatchId);
		}, delay);
	}

	function closeSocket() {
		intentionalClose = true;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
		socketMatchId = null;
		reconnectAttempts = 0;
		rejectAllPending({ error_code: 'CONNECTION_CLOSED', detail: 'Left the tribunal.' });
		if (socket) {
			try { socket.close(1000); } catch (_) { /* already closing */ }
			socket = null;
		}
	}

	function rejectAllPending(errorPayload) {
		for (const { reject, timeout } of pendingRequests.values()) {
			clearTimeout(timeout);
			reject(errorPayload);
		}
		pendingRequests.clear();
	}

	/** Fire a client->server message that expects a definite ack/error back. */
	function sendRequest(type, payload = {}) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return Promise.reject({ error_code: 'NOT_CONNECTED', detail: 'Not connected to the tribunal.' });
		}
		requestCounter += 1;
		const requestId = `req-${Date.now()}-${requestCounter}`;

		return new Promise((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				pendingRequests.delete(requestId);
				reject({ error_code: 'TIMEOUT', detail: 'The tribunal did not respond in time.' });
			}, REQUEST_TIMEOUT_MS);

			pendingRequests.set(requestId, { resolve, reject, timeout });
			socket.send(JSON.stringify({ type, request_id: requestId, payload }));
		});
	}

	/** Fire a client->server message with no ack expected (just `leave`). */
	function sendMessage(type, payload = {}) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type, payload }));
	}

	function handleServerMessage(message) {
		const { type, request_id: requestId, payload = {} } = message;

		if (type === 'ack' && requestId && pendingRequests.has(requestId)) {
			const { resolve, timeout } = pendingRequests.get(requestId);
			clearTimeout(timeout);
			pendingRequests.delete(requestId);
			resolve(payload);
			return;
		}

		if (type === 'error') {
			if (requestId && pendingRequests.has(requestId)) {
				const { reject, timeout } = pendingRequests.get(requestId);
				clearTimeout(timeout);
				pendingRequests.delete(requestId);
				reject(payload);
			} else {
				// Connection-level error, not tied to a specific request.
				Toast.show(payload.detail || ToastMessages.connectionLost(), 'error');
			}
			return;
		}

		switch (type) {
			case 'state_snapshot': return handleStateSnapshot(payload);
			case 'player_joined': return handlePlayerJoined(payload);
			case 'player_left': return handlePlayerLeftMsg(payload);
			case 'player_kicked': return handlePlayerKicked(payload);
			case 'kicked': return handleKicked(payload);
			case 'player_ready_changed': return handlePlayerReadyChanged(payload);
			case 'player_profile_updated': return handlePlayerProfileUpdated(payload);
			case 'settings_updated': return handleSettingsUpdated(payload);
			case 'host_changed': return handleHostChanged(payload);
			case 'start_availability_changed': return; // matchCanStart() derives this locally; nothing to apply.
			case 'ping_received': return handlePingReceived(payload);
			case 'player_connection_changed': return handlePlayerConnectionChanged(payload);
			case 'match_starting': return; // purely cosmetic countdown, starts_in_ms is always 0 today
			case 'match_started': return handleMatchStarted(payload);
			default:
				console.log(`Unhandled WS message type '${type}'`, payload);
		}
	}

	function _playerFromWire(p) {
		return {
			id: p.id,
			displayName: p.display_name,
			avatarUrl: p.avatar_url,
			isHost: Boolean(p.is_host),
			ready: Boolean(p.ready),
			readyForever: Boolean(p.ready_forever),
			isSpectator: Boolean(p.is_spectator),
			joinOrder: p.join_order,
			connectionStatus: p.connection_status,
			gracePeriodEndsAt: p.grace_period_ends_at,
		};
	}

	function handleStateSnapshot(payload) {
		state = {
			matchId: payload.match_id,
			joinCode: payload.join_code,
			name: payload.lobby_name,
			maxPlayers: payload.max_players,
			status: payload.status,
			localPlayerId: payload.local_player_id,
			players: (payload.players || []).map(_playerFromWire),
			settings: { ...DEFAULT_SETTINGS(), ...(payload.settings || {}) },
			pingCooldownUntil: payload.ping_cooldown_until ? Date.parse(payload.ping_cooldown_until) : null,
			pingCount: payload.ping_count || 0,
			connected: true,
		};
		persistSession();
		render();
	}

	function handlePlayerJoined(payload) {
		if (!state || !payload.player) return;
		const incoming = _playerFromWire(payload.player);
		if (!state.players.some((p) => p.id === incoming.id)) {
			state.players.push(incoming);
		}
		render();
	}

	function handlePlayerLeftMsg(payload) {
		if (!state) return;
		state.players = state.players.filter((p) => p.id !== payload.player_id);
		if (payload.new_host_id) {
			state.players.forEach((p) => { p.isHost = p.id === payload.new_host_id; });
		}
		render();
	}

	function handlePlayerKicked(payload) {
		if (!state) return;
		const wasMe = payload.player_id === state.localPlayerId;
		state.players = state.players.filter((p) => p.id !== payload.player_id);
		if (payload.new_host_id) {
			state.players.forEach((p) => { p.isHost = p.id === payload.new_host_id; });
		}
		if (!wasMe) render();
		// If it was me, the dedicated `kicked` message (below) drives the exit —
		// don't also render a lobby view for a seat we no longer hold.
	}

	function handleKicked(payload) {
		Toast.show(payload.detail || ToastMessages.matches.playerRemoved(), 'warning');
		leave({ silent: true, alreadyClosedByServer: true });
	}

	function handlePlayerReadyChanged(payload) {
		if (!state) return;
		const player = state.players.find((p) => p.id === payload.player_id);
		if (!player) return;
		player.ready = Boolean(payload.ready);
		player.readyForever = Boolean(payload.ready_forever);
		render();
	}

	/** A seated player (possibly us, possibly on another tab) changed their
	 * display name or avatar via the profile endpoints — see
	 * broadcast_player_profile_updated in routers/websockets.py. Not
	 * excluded for the acting player's own sockets, so this is also what
	 * keeps a second open tab of the same account in sync; the
	 * LobbySession.subscribe mirror below handles the acting tab's own
	 * instant feedback ahead of this round trip. */
	function handlePlayerProfileUpdated(payload) {
		if (!state) return;
		const player = state.players.find((p) => p.id === payload.player_id);
		if (!player) return;
		if (payload.display_name !== undefined) player.displayName = payload.display_name;
		if (payload.avatar_url !== undefined) player.avatarUrl = payload.avatar_url || null;
		render();
	}

	function handleSettingsUpdated(payload) {
		if (!state) return;
		state.settings = { ...DEFAULT_SETTINGS(), ...(payload.settings || {}) };
		if (payload.max_players !== undefined) state.maxPlayers = payload.max_players;
		// Mirrors the server's own reset rule (handle_update_settings resets
		// ready for everyone whose ready_forever is false) — the server
		// doesn't broadcast a player_ready_changed per player for this, this
		// message is the only signal, so the reset has to be applied here too.
		state.players.forEach((p) => { if (!p.readyForever) p.ready = false; });
		persistSession();
		render();
		bumpSettingsToast();
	}

	function handleHostChanged(payload) {
		if (!state) return;
		state.players.forEach((p) => { p.isHost = p.id === payload.host_id; });
		const newHost = state.players.find((p) => p.id === payload.host_id);
		if (newHost && payload.reason !== 'promoted') {
			// "promoted" already gets an explicit toast from promoteToHost()'s
			// own success path; the other reasons (left/kicked/disconnect
			// timeout) only ever surface through this broadcast.
			Toast.show(ToastMessages.matches.hostTransferred(newHost.displayName), 'info');
		}
		render();
	}

	function handlePingReceived(payload) {
		if (!state) return;
		state.pingCount = payload.ping_count;
		// The contract's ping_received payload doesn't carry a cooldown-until
		// timestamp, only ping_count/target list/louder — so the button's
		// countdown here is a best-effort local estimate for display only.
		// Actual enforcement is server-side regardless of what this shows
		// (an early click just comes back as a PING_ON_COOLDOWN error).
		state.pingCooldownUntil = Date.now() + PING_COOLDOWN_MS();

		const targets = new Set(payload.target_player_ids || []);
		if (targets.has(state.localPlayerId)) {
			try {
				if (pingAudio) {
					pingAudio.src = payload.louder ? PING_CUE_LOUDER_SRC() : PING_CUE_SRC();
					console.log('pingAudio.src', pingAudio.src);
					pingAudio.currentTime = 0;
					pingAudio.play();
				}
			} catch (_) { /* autoplay may be blocked */ }
			Toast.show(ToastMessages.matches.pingedUnready(), 'warning');
		}

		renderControls();
		restartPingCountdown();
	}

	function handlePlayerConnectionChanged(payload) {
		if (!state) return;
		const player = state.players.find((p) => p.id === payload.player_id);
		if (!player) return;
		player.connectionStatus = payload.connected ? 'connected' : 'disconnected';
		player.gracePeriodEndsAt = payload.grace_period_ends_at || null;
		render();
	}

	function handleMatchStarted(payload) {
		if (!state) return;
		state.status = 'in_progress';
		persistSession();
		closeMatchSettings();
		render();
		Toast.show(ToastMessages.matches.matchStarted(), 'success');
		window.location.href = `/static/pages/game.html?match=${state.matchId}`;
	}

	function restartPingCountdown() {
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

	/** Keeps a range input's --fill custom property (the filled portion of
	 * the track, see .volume-slider in music-controls.css) and its adjacent
	 * live-value display in sync with the input's current value. Shared by
	 * every slider row in the settings form (max players, cards per player)
	 * rather than duplicated per-slider, since they're all the same
	 * min/max/value -> percentage arithmetic. */
	function updateSliderFill(el, valueEl) {
		if (!el) return;
		const min = Number(el.min);
		const max = Number(el.max);
		const val = Number(el.value);
		const pct = max > min ? ((val - min) / (max - min)) * 100 : 100;
		el.style.setProperty('--fill', `${pct}%`);
		if (valueEl) valueEl.textContent = el.value;
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
			updateSliderFill(maxPlayersEl, maxPlayersValueEl);
		}

		const map = {
			reformation: 'setting-reformation',
			bot_fill: 'setting-bot-fill',
			time_bank: 'setting-time-bank',
			turn_timer: 'setting-turn-timer',
			challenge_timer: 'setting-challenge-timer',
			time_bank_count: 'setting-time-bank-count',
			character_copies: 'setting-char-copies',
			declared_coup: 'setting-declared-coup',
			declared_assassinate: 'setting-declared-assassinate',
			starting_coins: 'setting-starting-coins',
			coup_cost: 'setting-coup-cost',
			forced_coup_threshold: 'setting-forced-coup-threshold',
			assassinate_cost: 'setting-assassinate-cost',
			income_coins: 'setting-income-coins',
			foreign_aid_coins: 'setting-foreign-aid-coins',
			extort_coins: 'setting-extort-coins',
			tax_coins: 'setting-tax-coins',
			exchange_draw_cards: 'setting-exchange-cards',
			cards_per_player: 'setting-cards-per-player',
		};

		Object.entries(map).forEach(([key, id]) => {
			const el = document.getElementById(id);
			if (!el) return;
			if (el.type === 'checkbox') {
				el.checked = Boolean(s[key]);
			} else if (key === 'character_copies') {
				// Reverse of the -1 <-> 'inf' mapping in readSettingsFromForm —
				// the <select> only has an 'inf' option, no '-1' one. The
				// <select> only lists 3-7; anything above that — e.g. the
				// backend's cards_per_player/max_players/exchange_draw_cards
				// auto-increase deciding a finite deck can't fit everyone,
				// see constants.MATCH_SETTINGS_CROSS_FIELD_RULES — snaps to
				// 'inf' rather than leaving the <select> blank.
				el.value = (s[key] === -1 || s[key] > 7) ? 'inf' : String(s[key]);
			} else {
				el.value = String(s[key]);
			}
			el.disabled = !canEdit;
			if (el.type === 'range') {
				updateSliderFill(el, document.getElementById(`${id}-value`));
			}
		});

		// Forced-coup threshold can never sit below the cost of a coup (the
		// backend rejects it — see validate_settings_patch's cross-field
		// check). Pin the input's own min to the current coup cost here so
		// that's visible/enforced natively, on top of the live nudge in the
		// 'input' listener below and the belt-and-suspenders clamp in
		// readSettingsFromForm().
		const forcedCoupEl = document.getElementById('setting-forced-coup-threshold');
		if (forcedCoupEl) forcedCoupEl.min = String(s.coup_cost);

		const advancedWarningIcon = document.getElementById('advanced-rules-warning-icon');
		if (advancedWarningIcon) {
			const showWarning = hasNonDefaultAdvancedSettings(s);
			advancedWarningIcon.classList.toggle('hidden', !showWarning);
			advancedWarningIcon.setAttribute('aria-hidden', String(!showWarning));
		}

		refreshSettingDiffMarkers(s);
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

			const avatarSrc = player.avatarUrl || LOBBY_SETTINGS.user.defaultAvatarUrl;
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
					${showPromote ? `<button type="button" class="tribunal-tip tribunal-promote-btn is-visible" data-promote-id="${escapeAttr(player.id)}" data-tip="Promote to host">Host</button>` : ''}
					${showKick ? `<button type="button" class="tribunal-tip tribunal-kick-btn is-visible" data-kick-id="${escapeAttr(player.id)}" data-tip="Remove player" aria-label="Remove ${escapeAttr(player.displayName)}">${KICK_SVG}</button>` : ''}
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

	/**
	 * Called right after a successful create/join REST call (or from
	 * checkForActiveSession() on reconnect). payload only needs matchId —
	 * everything else about the lobby (roster, settings, host, ready
	 * states) comes from the server's state_snapshot once the socket opens,
	 * never fabricated here. Until that snapshot arrives, `state` holds a
	 * minimal placeholder so the sidebar can render a "connecting" shell
	 * instead of staying hidden.
	 */
	function enter(payload, opts = {}) {
		const user = LobbySession.get() || {};

		state = {
			matchId: payload.matchId,
			joinCode: payload.joinCode || '',
			name: payload.name || 'Tribunal',
			maxPlayers: payload.maxPlayers || LOBBY_SETTINGS.match.defaultMaxPlayers,
			status: payload.status || 'waiting',
			localPlayerId: payload.localPlayerId || user.username || '',
			players: [],
			settings: { ...DEFAULT_SETTINGS(), ...(payload.settings || {}) },
			pingCooldownUntil: null,
			pingCount: 0,
			connected: false,
		};

		persistSession();
		setMobileExpanded(false);
		settingsChangeCount = 0;
		render();
		connectSocket(payload.matchId);
		if (!opts.silent) {
			Toast.show(ToastMessages.matches.enteredLobby(state.name), 'success');
		}
	}

	function leave(opts = {}) {
		if (!state) return;
		if (!opts.alreadyClosedByServer) {
			sendMessage('leave', {});
		}
		closeSocket();
		state = null;
		persistSession();
		closeMatchSettings();
		closeReadyMenu();
		clearSettingsTimers();
		clearInterval(pingCountdownTimer);
		pingCountdownTimer = null;
		setMobileExpanded(false);
		settingsChangeCount = 0;
		render();
		if (!opts.silent) {
			Toast.show(ToastMessages.matches.leftLobby(), 'info');
		}
	}

	// ---- Host actions / player-facing actions, all real WS calls now --------

	/** Host kicks a player. Roster update comes back via the player_kicked
	 * broadcast (and, for the kicked player's own tab, the dedicated
	 * `kicked` message) — this function doesn't mutate state.players itself. */
	async function removePlayer(playerId) {
		if (!state || !viewerHasHostPowers()) return;
		try {
			await sendRequest('kick_player', { target_player_id: playerId });
			Toast.show(ToastMessages.matches.playerRemoved(), 'info');
		} catch (err) {
			Toast.show(err?.detail || ToastMessages.connectionLost(), 'error');
		}
	}

	/** Transfer sole host to another player. Roster update comes back via
	 * the host_changed broadcast. */
	async function promoteToHost(playerId) {
		if (!state || !viewerHasHostPowers()) return;
		const target = state.players.find((p) => p.id === playerId);
		if (!target || target.isHost) return;
		try {
			await sendRequest('promote_host', { target_player_id: playerId });
			Toast.show(ToastMessages.matches.promotedHost(target.displayName), 'success');
		} catch (err) {
			Toast.show(err?.detail || ToastMessages.connectionLost(), 'error');
		}
	}

	async function sendPingToUnready() {
		if (!state || !viewerHasHostPowers()) return;

		// Best-effort local pre-check so an obviously-on-cooldown click
		// doesn't even round-trip — the server is still the one that
		// actually enforces this (see PING_ON_COOLDOWN handling below), this
		// is purely to avoid a pointless request.
		if (state.pingCooldownUntil && Date.now() < state.pingCooldownUntil) {
			const secs = Math.ceil((state.pingCooldownUntil - Date.now()) / 1000);
			Toast.show(ToastMessages.matches.pingOnCooldown(secs), 'warning');
			return;
		}

		const unready = state.players.filter((p) => !p.isSpectator && !playerIsEffectivelyReady(p));
		if (unready.length === 0) return;

		try {
			await sendRequest('ping_unready', {});
			Toast.show(ToastMessages.matches.pingSent(unready.length), 'info');
			// Audio/toast for whoever's actually targeted (possibly including
			// us) plays from the ping_received broadcast handler, not here —
			// that's the one server-confirmed signal, and it reaches every
			// open tab, not just the one that clicked the button.
		} catch (err) {
			if (err?.error_code === 'PING_ON_COOLDOWN') {
				Toast.show(err.detail, 'warning');
			} else if (err?.error_code === 'NO_UNREADY_PLAYERS') {
				Toast.show(err.detail, 'info');
			} else {
				Toast.show(err?.detail || ToastMessages.connectionLost(), 'error');
			}
		}
	}

	/** Host changes settings. Sends only the changed subset (a partial patch,
	 * per the contract) — actual applied state comes back via the
	 * settings_updated broadcast, this doesn't mutate state.settings itself. */
	async function onSettingsChange(newSettings) {
		if (!state || !viewerHasHostPowers() || state.status !== 'waiting') return;

		const { max_players: maxPlayersRaw, ...restSettings } = newSettings;

		const patch = {};
		for (const [key, value] of Object.entries(restSettings)) {
			if (state.settings[key] !== value) patch[key] = value;
		}

		const nextMaxPlayers = maxPlayersRaw !== undefined ? Number(maxPlayersRaw) : state.maxPlayers;
		const minCap = state.players.length;
		const maxCap = LOBBY_SETTINGS.match?.maxPlayers ?? 10;
		const clampedMaxPlayers = Math.min(maxCap, Math.max(minCap, nextMaxPlayers));
		const maxPlayersChanged = clampedMaxPlayers !== state.maxPlayers;

		if (Object.keys(patch).length === 0 && !maxPlayersChanged) return;
		if (maxPlayersChanged) patch.max_players = clampedMaxPlayers;

		try {
			await sendRequest('update_settings', { settings: patch });
			// settings_updated broadcast (which also reaches this tab) applies
			// the change and fires bumpSettingsToast() — nothing more to do here.
		} catch (err) {
			// This is a spam floor, not a real rejection — the host didn't do
			// anything wrong, so retry once the server's own cooldown clears
			// instead of alarming them with an error toast. retry_after_ms
			// comes from the server (see handle_update_settings); if it's
			// somehow missing, fall back to treating this like any other error.
			if (err?.error_code === 'SETTINGS_ON_COOLDOWN' && typeof err.retry_after_ms === 'number') {
				clearTimeout(settingsRetryTimer);
				settingsRetryTimer = setTimeout(() => onSettingsChange(newSettings), err.retry_after_ms);
				return;
			}
			Toast.show(err?.detail || ToastMessages.connectionLost(), 'error');
			syncSettingsForm(); // snap the form back to the last known-good values
		}
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

	/**
	 * Mirrors the local player's own profile edits into the sidebar. Remote
	 * players' display names/avatars now arrive from the server itself (the
	 * state_snapshot on connect, plus player_joined for anyone who joins
	 * afterward) — there's no "watch someone else's profile" endpoint in the
	 * contract, so the polling this used to stub out doesn't have anything
	 * real to call. Kept as a named function (rather than inlined into the
	 * LobbySession.subscribe callback below) since it's still a reasonable
	 * public API surface if something else wants to force a re-sync.
	 */
	function refreshPlayerNames() {
		if (!state) return;
		const user = LobbySession.get();
		const me = localPlayer();
		if (!me || !user) return;
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
	}

	async function toggleReady(opts = {}) {
		const me = localPlayer();
		if (!me || !state || state.status !== 'waiting') return;

		// forever=false intentionally does NOT clear ready by itself, mirrors
		// the pre-existing UX rule: turning off "ready forever" drops back to
		// whatever the manual ready state already was.
		let nextForever = me.readyForever;
		let nextReady = me.ready;
		if (opts.forever) {
			nextForever = !me.readyForever;
			nextReady = nextForever ? true : me.ready;
		} else {
			nextForever = false;
			nextReady = !me.ready;
		}

		closeReadyMenu();
		try {
			await sendRequest('set_ready', { ready: nextReady, forever: nextForever });
			// player_ready_changed broadcasts back to this tab too, applying
			// the change — no local mutation here to avoid a double-update
			// racing the broadcast.
		} catch (err) {
			Toast.show(err?.detail || ToastMessages.connectionLost(), 'error');
		}
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

	async function startMatch() {
		if (!state || !viewerHasHostPowers()) return;

		if (!matchCanStart()) {
			Toast.show(ToastMessages.matches.cannotStartNotReady(), 'warning');
			return;
		}

		try {
			await sendRequest('start_match', {});
			// The actual status flip happens in handleMatchStarted(), driven by
			// the match_starting/match_started broadcasts — the server
			// re-validates readiness independently of matchCanStart() above,
			// so a NOT_ALL_READY here (roster changed a beat ago) is possible
			// and handled below rather than assumed impossible.
		} catch (err) {
			if (err?.error_code === 'NOT_ALL_READY') {
				Toast.show(ToastMessages.matches.cannotStartNotReady(), 'warning');
			} else {
				Toast.show(err?.detail || ToastMessages.connectionLost(), 'error');
			}
		}
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
		const assassinateCost = Number(document.getElementById('setting-assassinate-cost')?.value ?? 3);
		const incomeCoins = Number(document.getElementById('setting-income-coins')?.value ?? 1);
		const foreignAidCoins = Number(document.getElementById('setting-foreign-aid-coins')?.value ?? 2);
		const extortCoins = Number(document.getElementById('setting-extort-coins')?.value ?? 2);
		const taxCoins = Number(document.getElementById('setting-tax-coins')?.value ?? 3);
		const exchangeDrawCards = Number(document.getElementById('setting-exchange-cards')?.value ?? 2);
		const timeBankCount = Number(document.getElementById('setting-time-bank-count')?.value ?? 2);
		const cardsPerPlayer = Number(document.getElementById('setting-cards-per-player')?.value ?? 2);

		// Forced-coup threshold must never sit below the cost of a coup,
		// so clamp here to keep the form from submitting a contradictory pair.
		const forcedCoupRaw = Number(document.getElementById('setting-forced-coup-threshold')?.value ?? 10);
		const forcedCoupThreshold = Math.max(coupCost, forcedCoupRaw);

		// -1 is the wire/engine representation of "infinite" (see
		// constants.MATCH_SETTINGS_SCHEMA) — translated right here, at
		// the DOM boundary, so nothing downstream (diffing against
		// state.settings, the outgoing patch, validate_settings_patch)
		// ever sees the string 'inf' and rejects it as a non-integer.
		let characterCopies = copiesRaw === 'inf' ? -1 : Number(copiesRaw);

		// Best-effort mirror of validate_settings_patch()'s deck-size
		// cross-field rule — the backend check is the real gate (see
		// models/match.py), this is only here so the form doesn't show a
		// value the server is about to silently override. Skipped for an
		// infinite deck (characterCopies <= 0), which always has enough cards.
		const maxPlayersForCheck = maxPlayersRaw !== undefined ? Number(maxPlayersRaw) : state?.maxPlayers;
		if (characterCopies > 0 && maxPlayersForCheck !== undefined) {
			const minCopies = minCharacterCopiesFor(cardsPerPlayer, maxPlayersForCheck, exchangeDrawCards);
			// -1 here means "no finite count (up to the max of 7) fits" —
			// force infinite rather than Math.max-ing against a sentinel
			// that would otherwise just lose to any positive selection.
			characterCopies = minCopies === -1 ? -1 : Math.max(characterCopies, minCopies);
		}

		return {
			reformation: document.getElementById('setting-reformation')?.checked ?? false,
			bot_fill: document.getElementById('setting-bot-fill')?.value ?? 'none',
			time_bank: Number(document.getElementById('setting-time-bank')?.value ?? 60),
			turn_timer: Number(document.getElementById('setting-turn-timer')?.value ?? 30),
			challenge_timer: Number(document.getElementById('setting-challenge-timer')?.value ?? 5),
			time_bank_count: timeBankCount,
			character_copies: characterCopies,
			declared_coup: document.getElementById('setting-declared-coup')?.checked ?? false,
			declared_assassinate: document.getElementById('setting-declared-assassinate')?.checked ?? false,
			starting_coins: startingCoins,
			coup_cost: coupCost,
			forced_coup_threshold: forcedCoupThreshold,
			assassinate_cost: assassinateCost,
			income_coins: incomeCoins,
			foreign_aid_coins: foreignAidCoins,
			extort_coins: extortCoins,
			tax_coins: taxCoins,
			exchange_draw_cards: exchangeDrawCards,
			cards_per_player: cardsPerPlayer,
			max_players: maxPlayersRaw !== undefined ? Number(maxPlayersRaw) : undefined,
		};
	}

	/**
	 * On app init: ask the server whether this session is currently seated
	 * in a waiting-or-in-progress match, rather than trusting whatever
	 * matchId/joinCode happen to still be sitting in localStorage — a stale
	 * local copy (match ended, seat freed after a disconnect timeout, etc.)
	 * would otherwise reopen a socket connection that gets immediately
	 * refused. GET /api/matches/me/active is server-authoritative for this.
	 *
	 * Async now (the old stub was synchronous) — callers need to await it.
	 */
	async function checkForActiveSession() {
		let res;
		try {
			res = await fetch('/api/matches/me/active', { credentials: 'same-origin' });
		} catch (err) {
			return false;
		}
		if (!res.ok) return false;

		let data;
		try {
			data = await res.json();
		} catch (err) {
			return false;
		}
		if (!data?.match_id) return false;

		enter({ matchId: data.match_id, joinCode: data.join_code }, { silent: true });
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
		clearTimeout(settingsDebounceTimer);
		settingsDebounceTimer = setTimeout(() => {
			settingsDebounceTimer = null;
			onSettingsChange(readSettingsFromForm());
		}, SETTINGS_DEBOUNCE_MS);
	}

	// Live-sync settings on change (host/co-host only; form is readonly otherwise).
	// For the max-players range, 'change' only fires on release (mouseup/
	// keyup/touchend), which is exactly when we want to commit, since
	// resetting ready states and bumping the toast on every 'input' tick
	// while dragging would be disruptive. The label and fill still update
	// live on 'input' below, purely cosmetic, no settings commit.
	settingsForm?.addEventListener('change', handleSettingsFormUpdate);
	settingsForm?.addEventListener('input', (e) => {
		if (e.target.classList?.contains('match-settings-slider') && e.target.id) {
			updateSliderFill(e.target, document.getElementById(`${e.target.id}-value`));
		}

		// forced_coup_threshold must never sit below coup_cost. Nudge it up
		// live as soon as coup_cost is raised past it, rather than only
		// clamping silently at submit time (readSettingsFromForm) or
		// waiting on a server round trip to correct it.
		const coupCostEl = document.getElementById('setting-coup-cost');
		const forcedCoupEl = document.getElementById('setting-forced-coup-threshold');
		if (e.target === coupCostEl && coupCostEl && forcedCoupEl) {
			const coupCost = Number(coupCostEl.value);
			forcedCoupEl.min = String(coupCost);
			if (Number(forcedCoupEl.value) < coupCost) {
				forcedCoupEl.value = String(coupCost);
			}
		}

		// Instant feedback while the host is actively typing/dragging, ahead
		// of the debounced commit that would otherwise be the only thing
		// re-syncing these (see syncSettingsForm()).
		const formSettings = readSettingsFromForm();

		const advancedWarningIcon = document.getElementById('advanced-rules-warning-icon');
		if (advancedWarningIcon) {
			const showWarning = hasNonDefaultAdvancedSettings(formSettings);
			advancedWarningIcon.classList.toggle('hidden', !showWarning);
			advancedWarningIcon.setAttribute('aria-hidden', String(!showWarning));
		}

		refreshSettingDiffMarkers(formSettings);
	});

	/** navigator.clipboard requires a secure context (https, or localhost) —
	 * falls back to the legacy execCommand trick anywhere else (e.g. testing
	 * over a plain-http LAN address) instead of just failing silently. */
	async function copyText(text) {
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {
				// fall through to the legacy path below
			}
		}
		try {
			const scratch = document.createElement('textarea');
			scratch.value = text;
			scratch.style.position = 'fixed';
			scratch.style.opacity = '0';
			document.body.appendChild(scratch);
			scratch.focus();
			scratch.select();
			const ok = document.execCommand('copy');
			scratch.remove();
			return ok;
		} catch {
			return false;
		}
	}

	/** A link that drops a friend straight into this match: they hit the
	 * auth gate (login/signup/guest) same as anyone else, then main.js
	 * auto-joins with this code once that resolves. See main.js. */
	function inviteLink() {
		if (!state?.joinCode) return '';
		return `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(state.joinCode)}`;
	}

	bindTouchFriendlyClick(btnCopyCode, async () => {
		if (!state?.joinCode) return;
		const ok = await copyText(inviteLink());
		Toast.show(ok ? ToastMessages.matches.linkCopied() : ToastMessages.matches.codeCopyFailed(), ok ? 'success' : 'warning');
	});

	async function copyJoinCode() {
		if (!state?.joinCode) return;
		const ok = await copyText(state.joinCode);
		Toast.show(ok ? ToastMessages.matches.codeCopied() : ToastMessages.matches.codeCopyFailed(), ok ? 'success' : 'warning');
	}
	bindTouchFriendlyClick(joinCodeEl, copyJoinCode);
	joinCodeEl?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			copyJoinCode();
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
		matchCanStart,
		startMatch,
		refreshPlayerNames,
	};
})();