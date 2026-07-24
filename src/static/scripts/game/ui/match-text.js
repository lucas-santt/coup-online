import { actionLabel, ACTION_CLAIMS } from './labels.js';

/**
 * Reduces a GameState snapshot down to one "what's happening" descriptor.
 * Both hud.js (a short headline) and summary-panel.js (per-player active
 * decision + the pending-claim banner) render from this same shape rather
 * than each re-deriving it from `phase`/`turnDescription` independently.
 *
 * Returned shapes (discriminated by `kind`):
 *   { kind: 'none' }                                  -- not connected/started yet
 *   { kind: 'turn', playerId }                        -- WAITING_ACTION
 *   { kind: 'pending-claim', actorId, targetId, action, claim }   -- ACTION_DECLARED
 *   { kind: 'pending-block', blockerId, action, claim }           -- BLOCK_DECLARED
 *   { kind: 'card-loss', playerId }                   -- WAITING_CARD_LOSS
 *   { kind: 'exchange', playerId }                     -- WAITING_EXCHANGE
 *   { kind: 'resolving' }                              -- transient auto-advance states
 *   { kind: 'end', winnerId }                          -- END_OF_MATCH
 */
export function describeDecision(state) {
	if (state.finished || state.phase === 'end_of_match') {
		return { kind: 'end', winnerId: state.winner };
	}
	if (!state.phase) {
		return { kind: 'none' };
	}

	const td = state.turnDescription;

	switch (state.phase) {
		case 'waiting_action':
			return { kind: 'turn', playerId: state.turnPlayerId };

		case 'action_declared':
			return {
				kind: 'pending-claim',
				actorId: td?.sourceId,
				targetId: td?.targetId,
				action: td?.action,
				claim: td?.action ? ACTION_CLAIMS[td.action] : null,
			};

		case 'block_declared':
			return {
				kind: 'pending-block',
				blockerId: td?.blockerId,
				action: td?.action,
				claim: td?.blockClaimedCard,
			};

		case 'waiting_card_loss':
			return { kind: 'card-loss', playerId: td?.cardLossPlayerId };

		case 'waiting_exchange':
			return { kind: 'exchange', playerId: td?.sourceId };

		// action_confirmed / block_confirmed / action_challenge_confirmed /
		// block_challenge_confirmed / turn_resolved: transient states the
		// server chains through on its own (see websockets.py's
		// _AUTO_ADVANCE) -- nothing for a player to decide, just a beat
		// before the next real state lands.
		default:
			return { kind: 'resolving' };
	}
}

/** Short, single-line summary for the HUD bar. `players` is
 * GameState.players (id -> {displayName, ...}); `localPlayerId` lets this
 * say "Your Turn" instead of the local player's own name. */
export function headline(decision, players, localPlayerId) {
	const name = (id) => (id === localPlayerId ? 'You' : players?.[id]?.displayName || 'Someone');

	switch (decision.kind) {
		case 'none':
			return 'Connecting to match…';
		case 'turn':
			return decision.playerId === localPlayerId ? 'Your Turn' : `${name(decision.playerId)}'s Turn`;
		case 'pending-claim':
			return decision.actorId === localPlayerId
				? `You declare ${actionLabel(decision.action)}`
				: `${name(decision.actorId)} declares ${actionLabel(decision.action)}`;
		case 'pending-block':
			return decision.blockerId === localPlayerId
				? `You block with ${decision.claim || '?'}`
				: `${name(decision.blockerId)} blocks with ${decision.claim || '?'}`;
		case 'card-loss':
			return decision.playerId === localPlayerId
				? 'Choose a card to lose'
				: `${name(decision.playerId)} is choosing a card to lose`;
		case 'exchange':
			return decision.playerId === localPlayerId
				? 'Choose your cards'
				: `${name(decision.playerId)} is exchanging cards`;
		case 'resolving':
			return 'Resolving…';
		case 'end':
			return decision.winnerId ? `${name(decision.winnerId)} wins the match!` : 'Match over';
		default:
			return '';
	}
}
