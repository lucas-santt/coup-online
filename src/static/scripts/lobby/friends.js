// Friends panel. Exposed as `Friends.load()` since main.js triggers it
// from the tab-switch handler.
const Friends = (() => {
	const friendsGuestMessage = document.getElementById('friends-guest-message');
	const friendsListEl = document.getElementById('friends-list');

	function load() {
		const currentUser = LobbySession.get();

		if (!currentUser || currentUser.isGuest) {
			friendsGuestMessage.classList.remove('hidden');
			friendsListEl.classList.add('hidden');
			return;
		}

		friendsGuestMessage.classList.add('hidden');
		friendsListEl.classList.remove('hidden');

		console.log(`Friends List Requested: GET ${LOBBY_SETTINGS.endpoints.friends.list}`);
		// Mock data until the endpoint exists
		const mockFriends = [
			{ username: 'brutus77', display_name: 'Brutus', status: 'online' },
			{ username: 'livia_a', display_name: 'Livia', status: 'offline' },
		];

		friendsListEl.innerHTML = '';
		mockFriends.forEach((f) => {
			const li = document.createElement('li');
			li.className = 'friend-item';
			li.innerHTML = `
				<span class="friend-status friend-status-${f.status}"></span>
				<span class="friend-name">${f.display_name}</span>
			`;
			friendsListEl.appendChild(li);
		});
	}

	return { load };
})();