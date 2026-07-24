// Shared geometry/behavior for every radial menu in the match view (the
// Action Menu, Target Selection, and Contestation, spec §7.1/§7.2/§7.3).
// All three are "surround a center point, pick a direction" menus with
// the same mechanics -- evenly-spaced wedges, number-key shortcuts,
// tap-to-reveal tooltips on touch -- so that plumbing lives here once
// instead of being duplicated in each menu's own module.
//
// Wedges render as true pie slices (a per-wedge `clip-path: polygon(...)`
// computed here, since CSS alone can't do the trig) rather than the
// square stamps this used to be -- CSS custom properties carry the
// angle/count from JS, everything else is plain math.
//
// Each wedge is actually TWO elements sharing one `.radial-wedge-slot`:
// the `.radial-wedge` itself (the clipped pie-slice button -- art, icon,
// and background all live here and get visually clipped to the slice
// shape along with it) and a `.radial-wedge-overlay` sibling that is
// NOT clipped, holding the label/badge/tooltip. A clipped ancestor also
// clips its descendants, so anything meant to stay fully legible (a
// label chip, a tooltip box) has to live outside the clipped element --
// see radial-menu.css's ".radial-wedge:hover ~ .radial-wedge-overlay"
// rule, which is how the overlay still reacts to hovering the slice
// beneath it despite being a sibling, not a child.

// Inner/outer radius of the pie slices, as a percentage of the wedges
// container's own box (so the clip-path math stays independent of the
// container's actual pixel size, which itself varies with viewport --
// see radial-menu.css's `min(80vw, 460px)`). The inner radius leaves a
// hole in the middle for the hub (label / Back button) to sit in.
const INNER_RADIUS_PCT = 20;
const OUTER_RADIUS_PCT = 50;

/** Positions `.radial-wedge` children of `wedgesEl` evenly around a
 * circle: sets --wedge-count on the container, --wedge-angle on each
 * wedge's slot (inherited by the wedge's icon and its overlay's label,
 * both of which need to know their angle too), and a computed
 * `clip-path` directly on each wedge so it renders as a pie slice
 * instead of a full square. */
export function layoutWedges(wedgesEl, wedgeEls) {
	const count = wedgeEls.length;
	wedgesEl.style.setProperty('--wedge-count', String(count));
	const step = 360 / count;
	wedgesEl.querySelectorAll('.radial-separator').forEach((el) => el.remove());
	wedgeEls.forEach((el, i) => {
		const slot = el.closest('.radial-wedge-slot') || el.parentElement;
		const centerAngle = i * step; // 0 = top, increasing clockwise -- same convention the old square layout used
		slot.style.setProperty('--wedge-angle', `${centerAngle}deg`);
		el.style.clipPath = wedgeClipPath(centerAngle, step);
	});
	for (let i = 0; i < count; i++) {
		const separator = document.createElement('span');
		separator.className = 'radial-separator';
		separator.style.setProperty('--separator-angle', `${i * step - step / 2 + 180}deg`);
		wedgesEl.append(separator);
	}
}

function wedgeClipPath(centerAngleDeg, stepDeg) {
	// polarPoint's angle=-90 is "up", increasing clockwise, so shift the
	// whole slice range by -90 to make centerAngleDeg=0 mean "top" too.
	const start = centerAngleDeg - stepDeg / 2 - 90;
	const end = centerAngleDeg + stepDeg / 2 - 90;
	// One point roughly every 12 degrees so the outer/inner arcs read as
	// curves rather than obviously-straight chords once the slice spans
	// more than a few degrees.
	const arcSamples = Math.max(1, Math.ceil((end - start) / 6));
	const points = [];
	for (let s = 0; s <= arcSamples; s++) {
		points.push(polarPoint(OUTER_RADIUS_PCT, start + (end - start) * (s / arcSamples)));
	}
	for (let s = arcSamples; s >= 0; s--) {
		points.push(polarPoint(INNER_RADIUS_PCT, start + (end - start) * (s / arcSamples)));
	}
	return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;
}

function polarPoint(radiusPct, angleDeg) {
	const rad = (angleDeg * Math.PI) / 180;
	return [50 + radiusPct * Math.cos(rad), 50 + radiusPct * Math.sin(rad)];
}

/** Binds digit-key shortcuts (1-based, in DOM order) and optionally
 * Escape to a radial menu's wedges. Only call this while the menu is
 * actually open -- callers are expected to unbind (call the returned
 * teardown) the moment it closes, so two radial menus never both react
 * to the same keypress. */
export function bindRadialKeys(wedgesEl, { onEscape } = {}) {
	function handleKeydown(e) {
		if (e.key === 'Escape') {
			if (onEscape) {
				e.preventDefault();
				onEscape();
			}
			return;
		}
		const n = Number(e.key);
		if (!Number.isInteger(n) || n < 1) return;
		const wedge = wedgesEl.querySelectorAll('.radial-wedge')[n - 1];
		if (wedge && wedge.getAttribute('aria-disabled') !== 'true') {
			e.preventDefault();
			wedge.click();
		}
	}
	document.addEventListener('keydown', handleKeydown);
	return () => document.removeEventListener('keydown', handleKeydown);
}

/** Wires tap-to-reveal for every `.radial-tooltip-trigger` inside
 * `container` -- now always the wedge's `.radial-wedge-content` (see
 * radial-menu.css), one combined tooltip per wedge rather than separate
 * triggers for "what this does" and "do I own this character" that used
 * to be able to both pop open at once. Desktop instead relies on plain
 * CSS :hover/:focus-visible, so this only matters on touch devices, but
 * it's harmless to bind unconditionally. Returns a teardown function. */
export function bindTouchTooltips(container) {
	function onContainerClick(e) {
		const trigger = e.target.closest('.radial-tooltip-trigger');
		if (!trigger) return;
		e.stopPropagation();
		const wasOpen = trigger.classList.contains('is-tooltip-open');
		container
			.querySelectorAll('.radial-tooltip-trigger.is-tooltip-open')
			.forEach((el) => el.classList.remove('is-tooltip-open'));
		trigger.classList.toggle('is-tooltip-open', !wasOpen);
	}
	function onDocumentClick() {
		container
			.querySelectorAll('.radial-tooltip-trigger.is-tooltip-open')
			.forEach((el) => el.classList.remove('is-tooltip-open'));
	}
	container.addEventListener('click', onContainerClick);
	document.addEventListener('click', onDocumentClick);
	return () => {
		container.removeEventListener('click', onContainerClick);
		document.removeEventListener('click', onDocumentClick);
	};
}

export function bindPointerTooltips(container) {
	function onPointerMove(e) {
		const slot = e.target.closest('.radial-wedge-slot');
		if (!slot || !container.contains(slot)) return;
		const tooltip = slot.querySelector('.radial-tooltip');
		if (!tooltip) return;
		const triggerRect = tooltip.parentElement.getBoundingClientRect();
		tooltip.style.left = `${e.clientX - triggerRect.left}px`;
		tooltip.style.top = `${e.clientY - triggerRect.top}px`;
	}
	function onPointerLeave(e) {
		const slot = e.target.closest('.radial-wedge-slot');
		slot?.querySelector('.radial-tooltip')?.removeAttribute('style');
	}
	container.addEventListener('pointermove', onPointerMove);
	container.addEventListener('pointerleave', onPointerLeave, true);
	return () => {
		container.removeEventListener('pointermove', onPointerMove);
		container.removeEventListener('pointerleave', onPointerLeave, true);
	};
}
