const LANDING_SETTINGS = {
	pin: {
		viewportMargin: 20,
		centerDivisor: 3,
	},
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
	auth: {
		endpoints: {
			guest: '/api/auth/guest',
			login: '/api/auth/login',
			signup: '/api/auth/signup',
		},
		loginVerifyDelayMs: 1500,
		signupPledgeDelayMs: 1500,
		signupToLoginDelayMs: 1000,
		autoSubmitDelayMs: 600,
	},
};