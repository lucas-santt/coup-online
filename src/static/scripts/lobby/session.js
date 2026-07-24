// Shared lobby session state.
//
// Split out of main.js so profile.js, matches.js, friends.js, and
// tribunal-lobby.js can all read/update the current user without depending
// on script load order for a single shared `let currentUser` variable.
// Active tribunal membership (sidebar lobby) lives in TribunalLobby.
//
// `subscribe` notifies listeners on set/patch so the tribunal sidebar can
// mirror display-name / avatar changes immediately.

const LobbySession = (() => {
	let currentUser = null; // { isGuest, username, displayName, avatarUrl }
	const listeners = new Set();

	function get() {
		return currentUser;
	}

	function set(user) {
		currentUser = user;
		notify();
	}

	function patch(partial) {
		if (!currentUser) {
			currentUser = { ...partial };
		} else {
			currentUser = { ...currentUser, ...partial };
		}
		notify();
	}

	function subscribe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	function notify() {
		listeners.forEach((fn) => {
			try { fn(currentUser); } catch (_) { /* ignore listener errors */ }
		});
	}

	return { get, set, patch, subscribe };
})();
