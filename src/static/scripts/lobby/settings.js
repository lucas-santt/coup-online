const LOBBY_SETTINGS = {
	audio: {
		defaultVolume: 0.10,
		blurVolumeMultiplier: 0.30,
		fadeDefaultDurationMs: 200,
		fadeFocusDurationMs: 200,
		fadeSteps: 20,
	},
	toast: {
		autoDismissMs: 4500,
		// Panopticon Deco icon set: geometric, single-color (currentColor),
		// framed in the same square across all five so they read as one
		// family. `network` gets a broken signal line instead of an X,
		// to separate "the line went dead" from "you were refused".
		icons: {
			info: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1.5"/>
				<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5"/>
				<circle cx="12" cy="12" r="1.4" fill="currentColor"/>
			</svg>`,
			success: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1.5"/>
				<path d="M7 12.5L10.5 16L17 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
			</svg>`,
			warning: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M12 3L21 20H3L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>
				<line x1="12" y1="9" x2="12" y2="14.5" stroke="currentColor" stroke-width="1.8"/>
				<rect x="11.15" y="16" width="1.7" height="1.7" fill="currentColor"/>
			</svg>`,
			error: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1.5"/>
				<line x1="7" y1="7" x2="17" y2="17" stroke="currentColor" stroke-width="1.8"/>
				<line x1="17" y1="7" x2="7" y2="17" stroke="currentColor" stroke-width="1.8"/>
			</svg>`,
			network: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1.5"/>
				<line x1="7" y1="7" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.8"/>
				<line x1="13.5" y1="13.5" x2="17" y2="17" stroke="currentColor" stroke-width="1.8"/>
				<line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
			</svg>`,
		},
	},
	match: {
		minPlayers: 2,
		maxPlayers: 10,
		defaultMaxPlayers: 4,
		nameMaxLength: 30,
		passwordMaxLength: 50,
		codeMaxLength: 8,
		searchMaxLength: 30,
		pingCooldownMs: 5_000,
		sessionStorageKey: 'coupe.activeTribunal',

		// Every Nth ping (cumulative, per tribunal session) plays the
		// louder cue instead of the normal one, e.g. as a nudge once
		// polite pings keep getting ignored.
		pingCueSrc: '/static/assets/ping.wav',
		pingCueLouderSrc: '/static/assets/ping-louder.wav',
		pingCueLouderEveryNth: 5,
	},
	displayName: {
		maxLength: 20,
	},
	auth: {
		// Mirrors backend/constants.py — keep these in sync manually,
		// there's no shared source of truth between Python and JS here.
		usernameMinLength: 3,
		usernameMaxLength: 24,
		usernamePattern: /^[a-zA-Z0-9_]+$/,

		// bcrypt silently ignores input past 72 bytes, so capping here isn't
		// just "avoid a huge request" — it keeps the password the user thinks
		// they set from becoming a different, shorter one to the hasher.
		passwordMinLength: 3,
		passwordMaxLength: 72,
	},

	// ============================================================
	//  API CONTRACT
	//  Nothing here is wired to a real fetch() yet — every action
	//  is mocked with console.log + a toast, same placeholder
	//  pattern landing/main.js uses for auth. The shapes below are
	//  the intended contract for the FastAPI backend once these
	//  routes exist, so both sides can build against them.
	//
	//  On failure, real endpoints return:
	//    { detail: { error_code: string, detail: string } }
	//  error_code is looked up in ToastMessages.errorCodes
	//  (see toast-messages.js) to produce the shown message.
	// ============================================================
	endpoints: {
		auth: {
			guest: '/api/auth/guest',
			// POST /api/auth/guest
			// -> { message, username }  (username is backend-generated, e.g. "Guest-042817")

			login: '/api/auth/login',
			// POST /api/auth/login
			// body: { username: string, password: string }

			signup: '/api/auth/signup',
			// POST /api/auth/signup
			// body: { username: string, password: string, password_confirmation: string}

			logout: '/api/auth/logout',
			// POST /api/auth/logout
			// -> 204 No Content, clears the session token
		},

		profile: {
			me: '/api/profile/me',
			// GET /api/profile/me
			// -> { username, displayname, avatar_url, is_guest }

			displayName: '/api/profile/displayname',
			// PATCH /api/profile/displayname
			// body: { displayname: string }
			// -> { displayname }

			avatar: '/api/profile/avatar',
			// POST /api/profile/avatar  (multipart/form-data, field "avatar")
			// -> { avatar_url }
		},

		matches: {
			create: '/api/matches',
			// POST /api/matches
			// body: {
			//   lobby_name: string
			//   max_players: int,
			//   gamemode: "classic" | "reformation" | other dlc names, if any
			//   visibility: "public" | "private",
			//   password: string | omitted (if public)
			//   bot_fill: "none" | "fill" | "solo"
			// }
			// -> { match_id, join_code }

			list: '/api/matches',
			// GET /api/matches?visibility=public&max_players=4&lobby_name=brutus&gamemode=reformation
			// lobby_name: matched against match name, case-insensitive, substring
			// gamemode: "classic" | "reformation" | omitted (any)
			// -> [{ match_id, lobby_name, host_name, player_count, max_players,
			//        visibility, gamemode }]

			joinByCode: '/api/matches/join',
			// POST /api/matches/join
			// body: { join_code: string }
			// -> { match_id }

			joinById(matchId) {
				return `/api/matches/${matchId}/join`;
			},
			// POST /api/matches/{match_id}/join
			// body: { password: string | omitted (if public) }
			// -> { match_id }

			// --- Stage-2 lobby (stubs in tribunal-lobby.js; wire to WS later) ---
			// removePlayer(playerId), promoteToHost(playerId),
			// sendPingToUnready(), onSettingsChange(settings),
			// leave / start / ready toggles, checkForActiveSession()
		},

		friends: {
			list: '/api/friends',
			// GET /api/friends  (requires an authenticated, non-guest session)
			// -> [{ username, displayname, status: "online" | "offline" }]
		},
	},
};