// In-match websocket — the same connection the lobby's tribunal socket
// opened (see lobby/tribunal-lobby.js), just still open now that the
// match has actually started. Deliberately the same request/ack shape as
// the lobby socket (request_id-keyed promises for things that expect an
// ack, fire-and-forget for things that don't) so the two are easy to
// reason about side by side, but kept as its own module rather than
// reusing tribunal-lobby.js directly: that module owns lobby-shaped
// state (roster, ready flags, settings) this one has no business
// touching.
//
// This module only speaks the wire protocol. It knows nothing about game
// rules or UI -- see state/game-state.js for the layer that turns these
// messages into something a menu or the renderer can use.
const MatchSocket = (() => {
	const RECONNECT_BASE_DELAY_MS = 500;
	const RECONNECT_MAX_DELAY_MS = 8000;
	const REQUEST_TIMEOUT_MS = 8000;

	let socket = null;
	let matchId = null;
	let intentionalClose = false;
	let reconnectTimer = null;
	let reconnectAttempts = 0;
	let requestCounter = 0;
	const pendingRequests = new Map();

	// Plain callbacks rather than a full event-emitter -- this module only
	// ever has one subscriber (game-state.js), so there's nothing a
	// multi-listener pattern would buy here that isn't extra code.
	let onMessageCallback = null;
	let onConnectionChangeCallback = null;

	function wsUrl(id) {
		const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
		return `${scheme}${window.location.host}/api/ws/matches/${encodeURIComponent(id)}`;
	}

	function connect(id) {
		matchId = id;
		intentionalClose = false;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;

		let ws;
		try {
			ws = new WebSocket(wsUrl(id));
		} catch (err) {
			scheduleReconnect();
			return;
		}
		socket = ws;

		ws.addEventListener('open', () => {
			reconnectAttempts = 0;
			onConnectionChangeCallback?.(true);
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
			if (socket !== ws) return; // a newer socket already replaced this one
			socket = null;
			onConnectionChangeCallback?.(false);
			rejectAllPending({ error_code: 'CONNECTION_LOST', detail: 'Connection to the match was lost.' });

			if (intentionalClose) return;
			// Policy-violation close: the server refused outright (match
			// doesn't exist, or we're not seated in it) -- no point
			// reconnecting into the same refusal.
			if (event.code === 1008) return;
			scheduleReconnect();
		});

		ws.addEventListener('error', () => {
			// The close handler fires right after and schedules the
			// reconnect -- nothing additional to do here.
		});
	}

	function scheduleReconnect() {
		if (!matchId || intentionalClose) return;
		clearTimeout(reconnectTimer);
		const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts);
		reconnectAttempts += 1;
		reconnectTimer = window.setTimeout(() => {
			if (matchId) connect(matchId);
		}, delay);
	}

	function disconnect() {
		intentionalClose = true;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
		matchId = null;
		reconnectAttempts = 0;
		rejectAllPending({ error_code: 'CONNECTION_CLOSED', detail: 'Left the match.' });
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

	/** Fire a client->server message that expects a definite ack/error back
	 * (chosen_action, pass, block, challenge, selected_card, selected_cards
	 * all ack -- see backend/routers/websockets.py's in-match handlers). */
	function sendRequest(type, payload = {}) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return Promise.reject({ error_code: 'NOT_CONNECTED', detail: 'Not connected to the match.' });
		}
		requestCounter += 1;
		const requestId = `req-${Date.now()}-${requestCounter}`;

		return new Promise((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				pendingRequests.delete(requestId);
				reject({ error_code: 'TIMEOUT', detail: 'The server did not respond in time.' });
			}, REQUEST_TIMEOUT_MS);

			pendingRequests.set(requestId, { resolve, reject, timeout });
			socket.send(JSON.stringify({ type, request_id: requestId, payload }));
		});
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
		if (type === 'error' && requestId && pendingRequests.has(requestId)) {
			const { reject, timeout } = pendingRequests.get(requestId);
			clearTimeout(timeout);
			pendingRequests.delete(requestId);
			reject(payload);
			return;
		}

		// Everything else (state_snapshot, match_event, and any lobby-shaped
		// leftovers like player_connection_changed) gets handed straight to
		// the subscriber -- this module doesn't interpret message bodies.
		onMessageCallback?.(type, payload);
	}

	function onMessage(callback) {
		onMessageCallback = callback;
	}

	function onConnectionChange(callback) {
		onConnectionChangeCallback = callback;
	}

	return { connect, disconnect, sendRequest, onMessage, onConnectionChange };
})();

export default MatchSocket;