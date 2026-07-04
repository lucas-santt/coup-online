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
		maxPlayers: 6,
		defaultMaxPlayers: 4,
		nameMaxLength: 30,
		passwordMaxLength: 50,
	},
	displayName: {
		maxLength: 20,
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
			login: '/api/auth/login',
			signup: '/api/auth/signup',

			logout: '/api/auth/logout',
			// POST /api/auth/logout
			// -> 204 No Content, clears the session token
		},

		profile: {
			me: '/api/profile/me',
			// GET /api/profile/me
			// -> { username, display_name, avatar_url, is_guest }

			displayName: '/api/profile/display-name',
			// PATCH /api/profile/display-name
			// body: { display_name: string }
			// -> { display_name }

			avatar: '/api/profile/avatar',
			// POST /api/profile/avatar  (multipart/form-data, field "avatar")
			// -> { avatar_url }
		},

		matches: {
			create: '/api/matches',
			// POST /api/matches
			// body: {
			//   reformation: bool,
			//   max_players: int,
			//   visibility: "public" | "private",
			//   bot_fill: "none" | "fill" | "solo"
			// }
			// -> { match_id, join_code }

			list: '/api/matches',
			// GET /api/matches?visibility=public&max_players=4
			// -> [{ match_id, host_name, player_count, max_players,
			//        visibility, reformation }]

			joinByCode: '/api/matches/join',
			// POST /api/matches/join
			// body: { code: string }
			// -> { match_id }

			joinById(matchId) {
				return `/api/matches/${matchId}/join`;
			},
			// POST /api/matches/{match_id}/join
			// -> { match_id }
		},

		friends: {
			list: '/api/friends',
			// GET /api/friends  (requires an authenticated, non-guest session)
			// -> [{ username, display_name, status: "online" | "offline" }]
		},
	},
};