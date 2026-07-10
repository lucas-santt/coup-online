// Music volume (settings tab + floating widget, kept in sync).
(() => {
	const bgMusic = document.getElementById('bg-music');

	const musicControls = [
		{
			btn: document.getElementById('btn-music-toggle'),
			icon: document.getElementById('music-icon'),
			slider: document.getElementById('volume-slider'),
		},
		{
			btn: document.getElementById('btn-music-toggle-float'),
			icon: document.getElementById('music-icon-float'),
			slider: document.getElementById('volume-slider-float'),
		},
	];

	let isMuted = false;
	let currentSliderVal = LOBBY_SETTINGS.audio.defaultVolume;
	let fadeInterval = null;

	bgMusic.volume = LOBBY_SETTINGS.audio.defaultVolume;

	function syncSliders(val) {
		musicControls.forEach(({ slider }) => {
			slider.value = val;
			slider.style.setProperty('--fill', val + '%');
		});
	}

	function setMutedState(muted) {
		isMuted = muted;
		musicControls.forEach(({ icon, btn }) => {
			icon.classList.toggle('muted', muted);
			btn.setAttribute('aria-label', muted ? 'Play music' : 'Mute music');
		});
	}

	syncSliders(LOBBY_SETTINGS.audio.defaultVolume * 100);

	function tryStartMusic() {
		if (bgMusic.paused && !isMuted) bgMusic.play().catch(() => {});
		document.removeEventListener('click', tryStartMusic);
		document.removeEventListener('keydown', tryStartMusic);
	}
	document.addEventListener('click', tryStartMusic);
	document.addEventListener('keydown', tryStartMusic);

	musicControls.forEach(({ btn }) => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (isMuted || bgMusic.paused) {
				bgMusic.play();
				setMutedState(false);
				bgMusic.volume = currentSliderVal;
			} else {
				bgMusic.pause();
				setMutedState(true);
			}
		});
	});

	function updateVolume(val) {
		currentSliderVal = val / 100;
		syncSliders(val);

		if (!isMuted && !bgMusic.paused) bgMusic.volume = currentSliderVal;

		if (val == 0) {
			setMutedState(true);
		} else if (isMuted) {
			setMutedState(false);
			if (bgMusic.paused) bgMusic.play().catch(() => {});
		}
	}

	musicControls.forEach(({ slider }) => {
		slider.addEventListener('input', (e) => updateVolume(e.target.value));
	});

	function fadeVolumeTo(targetVolume, duration = LOBBY_SETTINGS.audio.fadeDefaultDurationMs) {
		if (isMuted || bgMusic.paused) return;

		clearInterval(fadeInterval);
		const startVolume = bgMusic.volume;
		const steps = LOBBY_SETTINGS.audio.fadeSteps;
		const stepTime = duration / steps;
		const volumeDelta = (targetVolume - startVolume) / steps;
		let currentStep = 0;

		fadeInterval = setInterval(() => {
			currentStep++;
			bgMusic.volume = Math.max(0, Math.min(currentSliderVal, startVolume + volumeDelta * currentStep));
			if (currentStep >= steps) {
				clearInterval(fadeInterval);
				bgMusic.volume = targetVolume;
			}
		}, stepTime);
	}

	window.addEventListener('blur', () => {
		fadeVolumeTo(currentSliderVal * LOBBY_SETTINGS.audio.blurVolumeMultiplier, LOBBY_SETTINGS.audio.fadeFocusDurationMs);
	});
	window.addEventListener('focus', () => {
		fadeVolumeTo(currentSliderVal, LOBBY_SETTINGS.audio.fadeFocusDurationMs);
	});
})();