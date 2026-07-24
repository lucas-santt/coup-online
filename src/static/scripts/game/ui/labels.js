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
