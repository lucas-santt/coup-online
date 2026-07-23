// Lobby-level websocket — not tied to any match. Every logged-in tab
// opens one of these (see main.js) so the server has somewhere to push
// a real-time "you've just been logged into on another device" notice.
// Without this, the old tab would only find out the next time it made
// an unrelated request and got a 401 back — this makes the handoff
// immediate instead. See backend/routers/lobby_ws.py for the server side.
//
// Deliberately minimal: no request/response contract, just one message
// type it might receive. If the socket drops for an ordinary network
// reason, it quietly reconnects; it never forces a logout by itself —
// only an explicit `session_replaced` message does that (handled in
// main.js).
const SessionSocket = (() => {
	let socket = null;
	let intentionalClose = false;
	let reconnectTimer = null;

	const RECONNECT_DELAY_MS = 3000;

	function wsUrl() {
		const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
		return `${scheme}${window.location.host}/api/ws/lobby`;
	}

	function connect() {
		if (socket) return; // already connected (or connecting)
		intentionalClose = false;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;

		let ws;
		try {
			ws = new WebSocket(wsUrl());
		} catch (err) {
			return;
		}
		socket = ws;

		ws.addEventListener('message', (event) => {
			let message;
			try {
				message = JSON.parse(event.data);
			} catch (err) {
				return;
			}
			if (message.type === 'session_replaced') {
				document.dispatchEvent(new CustomEvent('session-replaced'));
			}
		});

		ws.addEventListener('close', () => {
			if (socket !== ws) return; // a newer socket already replaced this one
			socket = null;
			if (intentionalClose) return;
			reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
		});

		ws.addEventListener('error', () => {
			// The close handler above fires right after and schedules the
			// reconnect — nothing additional to do here.
		});
	}

	/** Called on manual logout / session-replaced cleanup — no point
	 * reconnecting a socket for a session we've just walked away from. */
	function disconnect() {
		intentionalClose = true;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
		if (socket) {
			socket.close(1000);
			socket = null;
		}
	}

	return { connect, disconnect };
})();