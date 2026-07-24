// Mirrors backend/engine/enums.py. Action/Card wire values are the
// authoritative identifiers (used in requests and compared against
// state); everything here is display text only.

export const ACTION_LABELS = {
	income: 'Income',
	foreign_aid: 'Foreign Aid',
	coup: 'Coup',
	tax: 'Tax',
	assassinate: 'Assassinate',
	steal: 'Extort',
	exchange: 'Exchange',
};

export function actionLabel(action) {
	return ACTION_LABELS[action] || action;
}

// Fallbacks mirror backend/constants.py's MATCH_SETTINGS_SCHEMA defaults --
// only used if a description is somehow rendered before settings arrive,
// since GameState always has them by the time the Action Menu can open.
const DEFAULT_AMOUNTS = {
	incomeCoins: 1,
	foreignAidCoins: 2,
	taxCoins: 3,
	extortCoins: 2,
	coupCost: 7,
	assassinateCost: 3,
	exchangeDrawCards: 2,
};

/** One-line explanation of what an action does, with this match's own
 * coin amounts filled in (spec §7.1 wedges have no room for this text
 * themselves, so it surfaces as the wedge's hover/tap tooltip -- see
 * ui/action-menu.js). */
export function actionDescription(action, settings) {
	const s = { ...DEFAULT_AMOUNTS, ...(settings || {}) };
	switch (action) {
		case 'income':
			return `Take ${s.incomeCoins} coin from the treasury.`;
		case 'foreign_aid':
			return `Take ${s.foreignAidCoins} coins from the treasury. Anyone may block by claiming Duke.`;
		case 'coup':
			return `Pay ${s.coupCost} coins — the target loses a card. Cannot be blocked or challenged.`;
		case 'tax':
			return `Claim Duke to take ${s.taxCoins} coins from the treasury.`;
		case 'assassinate':
			return `Pay ${s.assassinateCost} coins and claim Assassin — the target loses a card unless they block with Contessa.`;
		case 'steal':
			return `Claim Captain to take ${s.extortCoins} coins from the target. They may block with Captain or Ambassador.`;
		case 'exchange':
			return `Claim Ambassador to draw ${s.exchangeDrawCards} cards, then return ${s.exchangeDrawCards}.`;
		default:
			return '';
	}
}

// Card enum values ("Ambassador", "Assassin", ...) are already the
// display name -- no mapping needed, this just documents that and gives
// callers one place to route through if that ever stops being true.
export function cardLabel(card) {
	return card;
}

// Mirrors enums.ACTION_CLAIMS: the character an action's own claim is
// pinned to. Only meaningful for challengeable actions -- income/
// foreign_aid/coup make no character claim so they have no entry.
export const ACTION_CLAIMS = {
	tax: 'Duke',
	steal: 'Captain',
	assassinate: 'Assassin',
	exchange: 'Ambassador',
};

// Mirrors enums.BLOCK_CLAIMS. Steal has two legal block claims -- the
// actual claim chosen is carried on the wire (turn_description.
// block_claimed_card), this is only used as a fallback label when
// describing a block generically (e.g. "Foreign Aid" has exactly one).
export const BLOCK_CLAIMS = {
	foreign_aid: ['Duke'],
	assassinate: ['Contessa'],
	steal: ['Captain', 'Ambassador'],
};

// Mirrors enums.TARGETED_ACTIONS: actions that need a target player chosen
// before they can be sent to the server (see match-view-spec.md §7.2,
// Target Selection).
export const TARGETED_ACTIONS = ['coup', 'assassinate', 'steal'];

// Maps a character to its card-art texture -- the same files the WebGL
// scene already loads (see game/settings.js's ASSETS.card.textures), so
// the Action Menu's per-wedge card art (spec §7.1's "Card art") reuses
// exactly the art players already recognize from the table instead of a
// second, divergent set of images. Duke has no existing texture yet
// (settings.js's own card asset list is missing one -- a pre-existing
// gap in the WebGL scene, out of scope here), so this filename is an
// assumption: add `Card-Duke_v2.0.png` alongside the others under
// /static/assets/img/game/ for that wedge's art to actually resolve.
const CARD_ART_FILENAMES = {
	Ambassador: 'Card-Ambassador_v2.0.png',
	Assassin: 'Card-Assasin_v2.0.png', // sic -- matches the existing asset's spelling
	Captain: 'Card-Captain_v2.0.png',
	Contessa: 'Card-Contessa_v2.0.png',
	Duke: 'Card-Duke_v2.0.png',
};

export function cardArtUrl(card) {
	const filename = CARD_ART_FILENAMES[card];
	return filename ? `/static/assets/img/game/${filename}` : null;
}
