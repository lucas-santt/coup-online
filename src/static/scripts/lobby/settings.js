const LOBBY_SETTINGS = {
	audio: {
		defaultVolume: 0.20,
		blurVolumeMultiplier: 0.30,
		fadeDefaultDurationMs: 200,
		fadeFocusDurationMs: 200,
		fadeSteps: 20,
	},
	toast: {
		autoDismissMs: 4500,
		icons: {
			info: '📜',
			success: '👑',
			warning: '⚔️',
			error: '🛡️',
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
	},
	displayName: {
		maxLength: 20,
	},
	auth: {
		// bcrypt silently ignores input past 72 bytes, so capping here isn't
		// just "avoid a huge request" — it keeps the password the user thinks
		// they set from becoming a different, shorter one to the hasher.
		usernameMaxLength: 24,
		passwordMaxLength: 72,
	},

	// ============================================================
	//  API CONTRACT
	//  Nothing here is wired to a real fetch() yet — every action
	//  is mocked with console.log + a toast, same placeholder
	//  pattern landing/main.js uses for auth. The shapes below are
	//  the intended contract for the FastAPI backend once these
	//  routes exist, so both sides can build against them.
	// ============================================================
	endpoints: {
		auth: {
			guest: '/api/auth/guest',
			// POST /api/auth/guest

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
		},

		friends: {
			list: '/api/friends',
			// GET /api/friends  (requires an authenticated, non-guest session)
			// -> [{ username, displayname, status: "online" | "offline" }]
		},
	},
};