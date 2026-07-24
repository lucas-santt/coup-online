// Shared by every module under game/ui/. Nothing here knows about game
// rules or GameState -- pure string/DOM helpers only.

export const DEFAULT_AVATAR_URL = '/static/assets/img/avatars/default/placeholder.png';

export function escapeHtml(str) {
	return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[ch]));
}

export function escapeAttr(str) {
	return escapeHtml(str);
}

export function avatarSrc(url) {
	return url || DEFAULT_AVATAR_URL;
}
