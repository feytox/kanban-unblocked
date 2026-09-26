import { useEffect, useState } from 'preact/compat';
import { Board, Item } from 'src/components/types';

import { BoardInsights, CardInfo, CardInsight, buildInsights, emptyInsight } from './insights';

// setTimeout can't wait longer than this.
const maxTimeout = 2 ** 31 - 1;

export interface CardAdapter {
  isResolved(item: Item, laneMarksComplete: boolean): boolean;
  getTitle(item: Item): string;
}

export function boardToCards(board: Board, adapter: CardAdapter): CardInfo[] {
  const cards: CardInfo[] = [];

  const toCard = (item: Item, archived: boolean, laneMarksComplete: boolean): CardInfo => {
    const { date, time, unlockAt } = item.data.metadata;
    const hasTime = !!(date && time);

    return {
      key: item.id,
      blockId: item.data.blockId,
      title: adapter.getTitle(item),
      resolved: adapter.isResolved(item, laneMarksComplete),
      archived,
      deadline: date?.isValid()
        ? {
            at: hasTime ? time.valueOf() : date.clone().endOf('day').valueOf(),
            hasTime,
          }
        : undefined,
      unlockAt: unlockAt?.isValid() ? unlockAt.valueOf() : undefined,
    };
  };

  for (const lane of board.children) {
    const marksComplete = !!(lane.data.shouldMarkItemsComplete || lane.data.resolvesBlockers);
    for (const item of lane.children) cards.push(toCard(item, false, marksComplete));
  }

  for (const item of board.data.archive) cards.push(toCard(item, true, false));

  return cards;
}

/**
 * Keeps the derived relation/availability state of one board in sync with its board state and
 * notifies only the cards whose insight actually changed, so a relation change or a card being
 * unlocked re-renders a handful of cards instead of the whole board.
 */
export class RelationStore {
  private board: Board | null = null;
  private insights: BoardInsights | null = null;
  private snapshots = new Map<string, string>();
  private cardInsights = new Map<string, CardInsight>();
  private cardListeners = new Map<string, Set<() => void>>();
  private listeners = new Set<() => void>();
  private timer: number | null = null;

  constructor(
    private adapter: CardAdapter,
    private getWindow: () => Window
  ) {}

  /** Call whenever the board state changes. Cheap when the board didn't change. */
  update(board: Board) {
    if (board === this.board) return;
    this.board = board;
    this.recompute();
  }

  /** Re-evaluates time-dependent state, e.g. after the device wakes up. */
  refresh() {
    if (this.board) this.recompute();
  }

  getInsights(): BoardInsights | null {
    return this.insights;
  }

  getCardInsight(key: string): CardInsight {
    return this.cardInsights.get(key) ?? emptyInsight;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeCard(key: string, fn: () => void) {
    let set = this.cardListeners.get(key);
    if (!set) this.cardListeners.set(key, (set = new Set()));
    set.add(fn);

    return () => {
      set.delete(fn);
      if (!set.size) this.cardListeners.delete(key);
    };
  }

  destroy() {
    this.clearTimer();
    this.listeners.clear();
    this.cardListeners.clear();
    this.board = null;
    this.insights = null;
  }

  private recompute() {
    const now = Date.now();
    const insights = buildInsights(
      boardToCards(this.board, this.adapter),
      this.board.data.relations ?? {},
      now
    );

    const changed: string[] = [];
    const nextSnapshots = new Map<string, string>();
    const nextInsights = new Map<string, CardInsight>();

    insights.cards.forEach((insight, key) => {
      const snapshot = JSON.stringify(insight);
      nextSnapshots.set(key, snapshot);
      if (this.snapshots.get(key) === snapshot) {
        nextInsights.set(key, this.cardInsights.get(key));
      } else {
        nextInsights.set(key, insight);
        changed.push(key);
      }
    });

    this.snapshots.forEach((_, key) => {
      if (!nextSnapshots.has(key)) changed.push(key);
    });

    this.snapshots = nextSnapshots;
    this.cardInsights = nextInsights;
    this.insights = insights;

    this.schedule(insights.nextChangeAt, now);

    for (const key of changed) this.cardListeners.get(key)?.forEach((fn) => fn());
    this.listeners.forEach((fn) => fn());
  }

  private clearTimer() {
    if (this.timer !== null) {
      this.getWindow().clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(at: number | undefined, now: number) {
    this.clearTimer();
    if (at === undefined) return;

    // A small margin so the card is surely unlocked when the timer fires.
    const delay = Math.min(Math.max(at - now + 100, 0), maxTimeout);
    this.timer = this.getWindow().setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, delay);
  }
}

export function useCardInsight(store: RelationStore, key: string): CardInsight {
  const [insight, setInsight] = useState(() => store.getCardInsight(key));

  useEffect(() => {
    setInsight(store.getCardInsight(key));
    return store.subscribeCard(key, () => setInsight(store.getCardInsight(key)));
  }, [store, key]);

  return insight;
}

export function useBoardInsights(store: RelationStore): BoardInsights | null {
  const [insights, setInsights] = useState(() => store.getInsights());

  useEffect(() => {
    setInsights(store.getInsights());
    return store.subscribe(() => setInsights(store.getInsights()));
  }, [store]);

  return insights;
}
