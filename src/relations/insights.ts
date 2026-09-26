import { Deadline, EffectiveDeadline, RelationIndex } from './RelationIndex';
import { UnavailableReason, evaluateAvailability } from './availability';
import { BoardRelations } from './types';

/** What the relations layer needs to know about a card, independent of the UI data model. */
export interface CardInfo {
  /** Stable key of the card in the current board state (the item's instance id). */
  key: string;
  blockId?: string;
  title: string;
  resolved: boolean;
  /** Archived cards take part in relations but don't get insights. */
  archived: boolean;
  deadline?: Deadline;
  unlockAt?: number;
}

export interface RelatedCard {
  key: string;
  blockId: string;
  title: string;
  resolved: boolean;
}

export interface CardInsight {
  reasons: UnavailableReason[];
  blockers: RelatedCard[];
  dependents: RelatedCard[];
  /** Set only when a card this one blocks is due earlier than this card itself. */
  inheritedDeadline?: EffectiveDeadline & { sourceTitle: string };
}

export interface BoardInsights {
  index: RelationIndex;
  cards: Map<string, CardInsight>;
  byBlockId: Map<string, CardInfo>;
  /** Earliest moment at which some insight changes because of time passing. */
  nextChangeAt?: number;
}

export const emptyInsight: CardInsight = Object.freeze({
  reasons: [],
  blockers: [],
  dependents: [],
}) as CardInsight;

export function buildInsights(
  cards: CardInfo[],
  relations: BoardRelations,
  now: number
): BoardInsights {
  const byBlockId = new Map<string, CardInfo>();
  for (const card of cards) {
    if (card.blockId && !byBlockId.has(card.blockId)) byBlockId.set(card.blockId, card);
  }

  const index = new RelationIndex(
    Array.from(byBlockId.values(), (card) => ({
      id: card.blockId,
      resolved: card.resolved || card.archived,
      deadline: card.deadline,
    })),
    relations
  );

  const toRelated = (blockId: string): RelatedCard => {
    const card = byBlockId.get(blockId);
    return {
      key: card.key,
      blockId,
      title: card.title,
      resolved: card.resolved || card.archived,
    };
  };

  const insights = new Map<string, CardInsight>();
  let nextChangeAt: number | undefined;

  for (const card of cards) {
    if (card.archived) continue;

    // Cards with a duplicated block id don't own it, so they have no relations.
    const blockId = card.blockId && byBlockId.get(card.blockId) === card ? card.blockId : undefined;
    const availability = evaluateAvailability(
      { blockId, resolved: card.resolved, unlockAt: card.unlockAt },
      { now, index }
    );

    if (availability.nextChangeAt !== undefined) {
      nextChangeAt = Math.min(nextChangeAt ?? Infinity, availability.nextChangeAt);
    }

    if (!blockId || !index.hasRelations(blockId)) {
      if (availability.reasons.length) {
        insights.set(card.key, { ...emptyInsight, reasons: availability.reasons });
      }
      continue;
    }

    const insight: CardInsight = {
      reasons: availability.reasons,
      blockers: index.getBlockers(blockId).map(toRelated),
      dependents: index.getDependents(blockId).map(toRelated),
    };

    const deadline = index.getEffectiveDeadline(blockId);
    if (
      deadline &&
      deadline.sourceId !== blockId &&
      (!card.deadline || deadline.at < card.deadline.at)
    ) {
      insight.inheritedDeadline = {
        ...deadline,
        sourceTitle: byBlockId.get(deadline.sourceId).title,
      };
    }

    insights.set(card.key, insight);
  }

  return { index, cards: insights, byBlockId, nextChangeAt };
}
