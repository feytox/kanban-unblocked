import { RelationIndex } from './RelationIndex';

/*
 * "Can I work on this card right now?" is answered by a list of independent rules. Each rule
 * says whether it makes the card unavailable and, optionally, when its answer may change on its
 * own (so the board knows when to re-evaluate without polling). To add a new kind of
 * unavailability, add a rule to `availabilityRules`.
 */

export type UnavailableReason = 'blocked' | 'time-blocked';

export interface AvailabilitySubject {
  blockId?: string;
  resolved: boolean;
  /** Epoch milliseconds before which the card is hidden. */
  unlockAt?: number;
}

export interface AvailabilityContext {
  now: number;
  index: RelationIndex;
}

export interface RuleVerdict {
  unavailable: boolean;
  /** Epoch milliseconds at which this verdict flips by itself. */
  nextChangeAt?: number;
}

export interface AvailabilityRule {
  reason: UnavailableReason;
  evaluate(subject: AvailabilitySubject, ctx: AvailabilityContext): RuleVerdict;
}

export const blockerRule: AvailabilityRule = {
  reason: 'blocked',
  evaluate(subject, { index }) {
    // A finished card (or one in a list that resolves blockers) has nothing left to wait for.
    if (subject.resolved) return { unavailable: false };
    return { unavailable: !!subject.blockId && index.isBlocked(subject.blockId) };
  },
};

export const timeBlockRule: AvailabilityRule = {
  reason: 'time-blocked',
  evaluate(subject, { now }) {
    if (subject.unlockAt === undefined || subject.unlockAt <= now) {
      return { unavailable: false };
    }
    return { unavailable: true, nextChangeAt: subject.unlockAt };
  },
};

export const availabilityRules: readonly AvailabilityRule[] = [blockerRule, timeBlockRule];

export interface Availability {
  reasons: UnavailableReason[];
  nextChangeAt?: number;
}

export function evaluateAvailability(
  subject: AvailabilitySubject,
  ctx: AvailabilityContext,
  rules: readonly AvailabilityRule[] = availabilityRules
): Availability {
  const reasons: UnavailableReason[] = [];
  let nextChangeAt: number | undefined;

  for (const rule of rules) {
    const verdict = rule.evaluate(subject, ctx);
    if (verdict.unavailable) reasons.push(rule.reason);
    if (verdict.nextChangeAt !== undefined) {
      nextChangeAt = Math.min(nextChangeAt ?? Infinity, verdict.nextChangeAt);
    }
  }

  return { reasons, nextChangeAt };
}

export interface AvailabilitySortKey {
  reasons: readonly UnavailableReason[];
  unlockAt?: number;
}

function availabilityRank(reasons: readonly UnavailableReason[]): number {
  if (!reasons.length) return 0;
  // Time-blocks end on a known date, blockers don't, so blocked cards go last.
  return reasons.includes('blocked') ? 2 : 1;
}

/** Orders available cards first, then time-blocked ones by unlock time, then blocked ones. */
export function compareAvailability(a: AvailabilitySortKey, b: AvailabilitySortKey): number {
  const rank = availabilityRank(a.reasons) - availabilityRank(b.reasons);
  if (rank !== 0) return rank;
  if (!a.reasons.length) return 0;
  return (a.unlockAt ?? Infinity) - (b.unlockAt ?? Infinity) || 0;
}
