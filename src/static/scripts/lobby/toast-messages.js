// src/static/scripts/lobby/toast-messages.js
//
// Single source of truth for every toast string in the lobby. Nothing
// in auth-overlay.js, main.js, or matches.js should hardcode a string
// passed to Toast.show() — it should come from here instead, so
// copy changes only ever touch this file.

const ToastMessages = {
	session: {
		loggedOut: () => 'Session closed. You have been logged out.',
		sessionReplaced: () => 'This account was logged in on another device. You have been disconnected.',
	},

	auth: {
		guestDenied: () => 'Request denied. No identity issued.',
		guestGranted: () => 'Provisional identity issued. You are on file.',
		missingFields: () => 'Identification and passcode are required.',
		verifying: (username) => `Verifying identity for "${username}"...`,
		loginSuccess: () => 'Identity confirmed. Access granted.',
		passwordsMismatch: () => 'Passcodes do not match. Resubmit.',
		filing: (username) => `Filing record for "${username}"...`,
		signupSuccess: () => 'Record filed. You are now known to the State.',
	},

	matches: {
		nameRequired: () => 'Name the assembly before filing it.',
		passwordRequired: () => 'Set a passcode to secure the private assembly.',
		creating: () => 'Filing assembly with Central Records...',
		created: (code) => `Assembly filed. Code: ${code}`,
		codeRequired: () => 'Enter an assembly code first.',
		seeking: (code) => `Locating assembly "${code}"...`,
		wrongPassword: () => 'Passcode rejected.',
		joining: (name) => `Joining "${name}"...`,
		noMatchesFound: () => 'No assemblies found. Widen your filters.',
		enteredLobby: (name) => `Seated in "${name}". Standing by.`,
		leftLobby: () => 'You have left the tribunal.',
		playerRemoved: () => 'Officer removed from the tribunal.',
		hostTransferred: (name) => `Host authority transferred to ${name}.`,
		promotedHost: (name) => `${name} is now the host.`,
		pingedUnready: () => 'The host requests you ready up.',
		pingSent: (n) => `Ping dispatched to ${n} unready officer${n === 1 ? '' : 's'}.`,
		pingOnCooldown: (secs) => `Ping on cooldown — wait ${secs}s.`,
		settingsUpdated: (n = 1) => n === 1
			? '1 statute amended. Ready states reset.'
			: `${n} statutes amended. Ready states reset.`,
		matchStarted: () => 'The tribunal is now in session.',
		cannotStartNotReady: () => 'Cannot start — not all officers are ready.',
		cannotStartTooFew: () => 'Cannot start — need at least two officers seated.',
		codeCopied: () => 'Join code copied.',
		codeCopyFailed: () => 'Could not copy the join code.',
		linkCopied: () => 'Invite link copied — anyone who opens it joins this match directly.',
		joinedViaLink: () => 'Invite link accepted. Seated in the tribunal.',
	},

	// Generic, connection-level failure — distinct from the API
	// rejecting a request outright. Used in every fetch() catch block.
	connectionLost: () => 'Connection to Central Records lost.',

	// error_code -> themed message. Backend routes return
	// { detail: { error_code, detail } } on failure (see backend/errors.py);
	// this is the frontend half of that contract.
	errorCodes: {
		INVALID_CREDENTIALS: 'Identification not recognized. Access denied.',
		USERNAME_TAKEN: 'Identity already on file. Choose another.',
		USERNAME_INVALID: 'Identification format rejected.',
		PASSWORD_TOO_SHORT: 'Passcode too short for Central Records.',
		PASSWORDS_DONT_MATCH: 'Passcodes do not match. Resubmit.',
		MATCH_NOT_FOUND: 'No such assembly on record.',
		MATCH_FULL: 'Assembly has reached full capacity.',
		WRONG_PASSWORD: 'Passcode rejected.',
		ALREADY_IN_MATCH: 'You are already registered to this assembly.',
		UNKNOWN_ERROR: 'Request rejected by Central Records.',
	},

	fromErrorCode(code) {
		return this.errorCodes[code] ?? this.errorCodes.UNKNOWN_ERROR;
	},

	// Pulls error_code out of a failed fetch Response and resolves it
	// to a themed string. Falls back to UNKNOWN_ERROR if the body
	// isn't JSON or doesn't carry the expected shape.
	async fromResponse(res) {
		try {
			const data = await res.json();
			return this.fromErrorCode(data?.detail?.error_code);
		} catch {
			return this.fromErrorCode(null);
		}
	},
};