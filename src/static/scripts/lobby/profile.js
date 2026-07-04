// Header profile controls: avatar picker/cropper and click-to-edit
// display name.
(() => {
	const displayNameEl = document.getElementById('display-name');
	const displayNameInput = document.getElementById('display-name-input');
	const btnEditName = document.getElementById('btn-edit-name');
	const btnAvatar = document.getElementById('btn-avatar');
	const avatarInput = document.getElementById('avatar-input');
	const avatarImg = document.getElementById('avatar-img');

	// =============================================
	//  Header: Avatar
	// =============================================
	btnAvatar.addEventListener('click', () => avatarInput.click());

	avatarInput.addEventListener('change', () => {
		const file = avatarInput.files[0];
		if (!file) return;
		openAvatarEditor(file);
	});

	// =============================================
	//  Avatar Editor popup: GitHub-style square crop.
	//  The whole image is always visible; a dashed square can be
	//  dragged around and resized (drag any corner, or the slider).
	//  Everything outside the square is darkened; the source image
	//  itself is never altered, only the square's position/size.
	// =============================================
	const avatarEditOverlay = document.getElementById('avatar-edit-overlay');
	const avatarEditCanvas = document.getElementById('avatar-edit-canvas');
	const avatarSizeSlider = document.getElementById('avatar-zoom-slider');
	const btnAvatarCancel = document.getElementById('btn-avatar-cancel');
	const btnAvatarConfirm = document.getElementById('btn-avatar-confirm');
	const avatarCtx = avatarEditCanvas.getContext('2d');

	const STAGE_MAX = 320; // largest stage dimension, in canvas px
	const HANDLE_HIT = 18; // resize-handle hit-test radius, in canvas px
	const MIN_SQUARE = 40;

	let editImage = null;
	let editFileName = '';
	let stageScale = 1; // image px -> canvas px
	let squareX = 0;
	let squareY = 0;
	let squareSize = 0;
	let dragMode = null; // 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | null
	let dragStart = null;

	// Pointer coords arrive in CSS px; the canvas can be CSS-scaled
	// smaller than its own width/height attributes (see max-width:
	// 100% in lobby.css), so map through that ratio to stay accurate.
	function getCanvasPos(e) {
		const rect = avatarEditCanvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (avatarEditCanvas.width / rect.width),
			y: (e.clientY - rect.top) * (avatarEditCanvas.height / rect.height),
		};
	}

	function layoutStage() {
		stageScale = Math.min(STAGE_MAX / editImage.width, STAGE_MAX / editImage.height);
		avatarEditCanvas.width = Math.round(editImage.width * stageScale);
		avatarEditCanvas.height = Math.round(editImage.height * stageScale);

		squareSize = Math.min(avatarEditCanvas.width, avatarEditCanvas.height);
		squareX = (avatarEditCanvas.width - squareSize) / 2;
		squareY = (avatarEditCanvas.height - squareSize) / 2;

		avatarSizeSlider.min = MIN_SQUARE;
		avatarSizeSlider.max = squareSize;
		avatarSizeSlider.value = squareSize;
	}

	function clampSquare() {
		const maxSquare = Math.min(avatarEditCanvas.width, avatarEditCanvas.height);
		squareSize = Math.min(Math.max(squareSize, MIN_SQUARE), maxSquare);
		squareX = Math.min(Math.max(squareX, 0), avatarEditCanvas.width - squareSize);
		squareY = Math.min(Math.max(squareY, 0), avatarEditCanvas.height - squareSize);
	}

	function drawStage() {
		const w = avatarEditCanvas.width;
		const h = avatarEditCanvas.height;
		avatarCtx.clearRect(0, 0, w, h);

		// Whole image, full brightness.
		avatarCtx.drawImage(editImage, 0, 0, w, h);

		// Dark mask over everything...
		avatarCtx.fillStyle = 'rgba(10, 6, 2, 0.6)';
		avatarCtx.fillRect(0, 0, w, h);

		// ...except back to full brightness inside the crop square.
		avatarCtx.save();
		avatarCtx.beginPath();
		avatarCtx.rect(squareX, squareY, squareSize, squareSize);
		avatarCtx.clip();
		avatarCtx.drawImage(editImage, 0, 0, w, h);
		avatarCtx.restore();

		// Dashed crop outline.
		avatarCtx.save();
		avatarCtx.setLineDash([6, 4]);
		avatarCtx.lineWidth = 2;
		avatarCtx.strokeStyle = '#d4af37';
		avatarCtx.strokeRect(squareX + 1, squareY + 1, squareSize - 2, squareSize - 2);
		avatarCtx.restore();

		// Resize handles, one per corner.
		const handleSize = 12;
		avatarCtx.fillStyle = '#d4af37';
		for (const [hx, hy] of cornerPoints()) {
			avatarCtx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
		}
	}

	// Corner order matches the 'resize-*' mode names: tl, tr, bl, br.
	function cornerPoints() {
		return [
			[squareX, squareY],
			[squareX + squareSize, squareY],
			[squareX, squareY + squareSize],
			[squareX + squareSize, squareY + squareSize],
		];
	}

	function hitTest(x, y) {
		const names = ['resize-tl', 'resize-tr', 'resize-bl', 'resize-br'];
		const corners = cornerPoints();
		for (let i = 0; i < corners.length; i++) {
			const [cx, cy] = corners[i];
			if (Math.hypot(x - cx, y - cy) <= HANDLE_HIT) return names[i];
		}
		if (x >= squareX && x <= squareX + squareSize && y >= squareY && y <= squareY + squareSize) return 'move';
		return null;
	}

	function setSquareSizeCentered(newSize) {
		const centerX = squareX + squareSize / 2;
		const centerY = squareY + squareSize / 2;
		squareSize = newSize;
		squareX = centerX - squareSize / 2;
		squareY = centerY - squareSize / 2;
		clampSquare();
		drawStage();
	}

	function openAvatarEditor(file) {
		editFileName = file.name;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				editImage = img;
				layoutStage();
				drawStage();
				avatarEditOverlay.classList.add('visible');
				avatarEditOverlay.setAttribute('aria-hidden', 'false');
			};
			img.src = reader.result;
		};
		reader.readAsDataURL(file);
	}

	function closeAvatarEditor() {
		avatarEditOverlay.classList.remove('visible');
		avatarEditOverlay.setAttribute('aria-hidden', 'true');
		editImage = null;
		avatarInput.value = '';
	}

	avatarSizeSlider.addEventListener('input', () => {
		setSquareSizeCentered(Number(avatarSizeSlider.value));
	});

	avatarEditCanvas.addEventListener('pointerdown', (e) => {
		const { x, y } = getCanvasPos(e);
		dragMode = hitTest(x, y);
		if (!dragMode) return;
		dragStart = { x, y, squareX, squareY, squareSize };
		avatarEditCanvas.setPointerCapture(e.pointerId);
	});

	avatarEditCanvas.addEventListener('pointermove', (e) => {
		const { x, y } = getCanvasPos(e);

		if (!dragMode) {
			// Just hovering: hint at what a click would do.
			const hit = hitTest(x, y);
			const cursors = { 'resize-tl': 'nwse-resize', 'resize-br': 'nwse-resize', 'resize-tr': 'nesw-resize', 'resize-bl': 'nesw-resize', move: 'move' };
			avatarEditCanvas.style.cursor = cursors[hit] || 'default';
			return;
		}

		const dx = x - dragStart.x;
		const dy = y - dragStart.y;

		if (dragMode === 'move') {
			squareX = dragStart.squareX + dx;
			squareY = dragStart.squareY + dy;
		} else {
			// Grow/shrink from the dragged corner while keeping the
			// opposite corner fixed as the anchor.
			const left = dragStart.squareX;
			const top = dragStart.squareY;
			const right = dragStart.squareX + dragStart.squareSize;
			const bottom = dragStart.squareY + dragStart.squareSize;

			let delta;
			if (dragMode === 'resize-br') delta = Math.max(dx, dy);
			else if (dragMode === 'resize-tl') delta = Math.max(-dx, -dy);
			else if (dragMode === 'resize-tr') delta = Math.max(dx, -dy);
			else delta = Math.max(-dx, dy); // resize-bl

			squareSize = dragStart.squareSize + delta;

			if (dragMode === 'resize-br') {
				squareX = left;
				squareY = top;
			} else if (dragMode === 'resize-tl') {
				squareX = right - squareSize;
				squareY = bottom - squareSize;
			} else if (dragMode === 'resize-tr') {
				squareX = left;
				squareY = bottom - squareSize;
			} else {
				squareX = right - squareSize;
				squareY = top;
			}
		}

		clampSquare();
		avatarSizeSlider.value = Math.round(squareSize);
		drawStage();
	});

	avatarEditCanvas.addEventListener('pointerup', () => { dragMode = null; });
	avatarEditCanvas.addEventListener('pointercancel', () => { dragMode = null; });

	btnAvatarCancel.addEventListener('click', closeAvatarEditor);

	btnAvatarConfirm.addEventListener('click', () => {
		const outSize = 280;
		const outCanvas = document.createElement('canvas');
		outCanvas.width = outSize;
		outCanvas.height = outSize;

		// Map the on-screen crop square back to the original image's
		// own pixel coordinates (the stage is scaled by stageScale).
		const sx = squareX / stageScale;
		const sy = squareY / stageScale;
		const sSize = squareSize / stageScale;

		outCanvas.getContext('2d').drawImage(editImage, sx, sy, sSize, sSize, 0, 0, outSize, outSize);

		avatarImg.src = outCanvas.toDataURL('image/png');
		console.log(`Avatar Upload Requested: POST ${LOBBY_SETTINGS.endpoints.profile.avatar} | file: "${editFileName}"`);
		Toast.show('Portrait updated.', 'success');
		closeAvatarEditor();
	});

	// =============================================
	//  Header: Display Name (click-to-edit)
	// =============================================
	function startEditingName() {
		const currentUser = LobbySession.get();
		displayNameInput.value = currentUser.displayName;
		displayNameInput.maxLength = LOBBY_SETTINGS.displayName.maxLength;
		displayNameEl.classList.add('hidden');
		displayNameInput.classList.remove('hidden');
		displayNameInput.focus();
		displayNameInput.select();
	}

	function commitNameEdit() {
		const currentUser = LobbySession.get();
		const newName = displayNameInput.value.trim();
		displayNameInput.classList.add('hidden');
		displayNameEl.classList.remove('hidden');

		if (!newName || newName === currentUser.displayName) return;

		LobbySession.patch({ displayName: newName });
		displayNameEl.textContent = newName;
		console.log(`Display Name Update: PATCH ${LOBBY_SETTINGS.endpoints.profile.displayName} | display_name: "${newName}"`);
		Toast.show('Name updated.', 'success');
	}

	btnEditName.addEventListener('click', startEditingName);
	displayNameEl.addEventListener('click', startEditingName);
	displayNameInput.addEventListener('blur', commitNameEdit);
	displayNameInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') displayNameInput.blur();
		if (e.key === 'Escape') {
			displayNameInput.value = LobbySession.get().displayName;
			displayNameInput.blur();
		}
	});
})();