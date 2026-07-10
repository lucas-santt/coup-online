// Shared lobby session state.
//
// Split out of main.js so profile.js, matches.js, and friends.js can all
// read/update the current user without depending on script load order for
// a single shared `let currentUser` variable. Not a full pub-sub, just a
// getter/setter: every consumer here only touches the user from inside a
// click handler that fires after the lobby is already revealed, so there's
// no need to react to changes happening elsewhere.

const LobbySession = (() => {
	let currentUser = null; // { isGuest, username, displayName, avatarUrl }

	function get() {
		return currentUser;
	}

	function set(user) {
		currentUser = user;
	}

	function patch(partial) {
		currentUser = { ...currentUser, ...partial };
	}

	return { get, set, patch };
})();