// Shared geometry/behavior for every radial menu in the match view (the
// Action Menu and Target Selection, spec §7.1/§7.2). Both are "surround
// a center point, pick a direction" menus with the same mechanics --
// evenly-spaced wedge placement, number-key shortcuts, tap-to-reveal
// tooltips on touch -- so that plumbing lives here once instead of being
// duplicated in each menu's own module.
//
// Deliberately NOT rendered as true pie slices: Panopticon Deco is built
// from flat rectilinear color blocks and hard offset shadows (see
// tokens.css's --shadow-stamp), which a smooth pie-chart silhouette
// fights against. Each "wedge" is instead a square stamp-style button
// evenly spaced around a circle -- the same radial interaction (angle as
// direction, number keys as shortcuts) without an out-of-place rounded
// shape. "CS:GO-style" in the spec describes the interaction model, not
// a literal rendering requirement.

/** Positions `.radial-wedge` children of `wedgesEl` evenly around a
 * circle by setting the two CSS custom properties radial-menu.css reads
 * (--wedge-count on the container, --wedge-index on each wedge). The
 * radius itself lives in CSS (with a media-query override for small
 * screens, per spec §6) since it's a presentational constant, not
 * per-instance data. */
export function layoutWedges(wedgesEl, wedgeEls) {
	wedgesEl.style.setProperty('--wedge-count', String(wedgeEls.length));
	wedgeEls.forEach((el, i) => el.style.setProperty('--wedge-index', String(i)));
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
 * `container` -- disabled-wedge cost tooltips, character-owned badges.
 * Desktop instead relies on plain CSS :hover/:focus-visible (see
 * radial-menu.css), so this only matters on touch devices, but it's
 * harmless to bind unconditionally. Returns a teardown function. */
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
