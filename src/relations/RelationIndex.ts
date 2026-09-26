import { BoardRelations } from './types';

export interface Deadline {
  /** Epoch milliseconds. Date-only deadlines point at the end of their day. */
  at: number;
  hasTime: boolean;
}

export interface EffectiveDeadline extends Deadline {
  /** Block id of the card the deadline comes from. */
  sourceId: string;
}

export interface RelationNode {
  id: string;
  /** Done, cancelled or archived: a resolved card no longer blocks anything. */
  resolved: boolean;
  deadline?: Deadline;
}

export interface ConnectedGraph {
  ids: Set<string>;
  /** `[blocker, blocked]` pairs. */
  edges: Array<[string, string]>;
}

const emptyList: string[] = [];

/**
 * Read-only view of a board's relations, built once per board state in O(cards + relations).
 * Relations that point at cards missing from the board are ignored.
 */
export class RelationIndex {
  private nodes = new Map<string, RelationNode>();
  private blockers = new Map<string, string[]>();
  private dependents = new Map<string, string[]>();
  private deadlineCache = new Map<string, EffectiveDeadline | null>();

  constructor(nodes: Iterable<RelationNode>, relations: BoardRelations) {
    for (const node of nodes) {
      if (!this.nodes.has(node.id)) this.nodes.set(node.id, node);
    }

    const map = relations['blocked-by'] ?? {};
    for (const blocked of Object.keys(map)) {
      if (!this.nodes.has(blocked)) continue;

      for (const blocker of map[blocked]) {
        if (blocker === blocked || !this.nodes.has(blocker)) continue;

        const list = this.blockers.get(blocked);
        if (list?.includes(blocker)) continue;

        if (list) list.push(blocker);
        else this.blockers.set(blocked, [blocker]);

        const deps = this.dependents.get(blocker);
        if (deps) deps.push(blocked);
        else this.dependents.set(blocker, [blocked]);
      }
    }
  }

  has(id: string) {
    return this.nodes.has(id);
  }

  getNode(id: string) {
    return this.nodes.get(id);
  }

  /** Cards that block `id`. */
  getBlockers(id: string): string[] {
    return this.blockers.get(id) ?? emptyList;
  }

  /** Cards that `id` blocks. */
  getDependents(id: string): string[] {
    return this.dependents.get(id) ?? emptyList;
  }

  hasRelations(id: string) {
    return this.blockers.has(id) || this.dependents.has(id);
  }

  getUnresolvedBlockers(id: string): string[] {
    return this.getBlockers(id).filter((blocker) => !this.nodes.get(blocker).resolved);
  }

  isBlocked(id: string) {
    return this.getBlockers(id).some((blocker) => !this.nodes.get(blocker).resolved);
  }

  /** Everything `id` transitively depends on or is depended on by, with the edges between them. */
  getConnected(id: string): ConnectedGraph {
    const ids = new Set<string>([id]);
    const edges: Array<[string, string]> = [];

    const walk = (start: string, next: (id: string) => string[], upstream: boolean) => {
      const seen = new Set([start]);
      const stack = [start];

      while (stack.length) {
        const current = stack.pop();
        for (const other of next(current)) {
          edges.push(upstream ? [other, current] : [current, other]);
          if (seen.has(other)) continue;
          seen.add(other);
          ids.add(other);
          stack.push(other);
        }
      }
    };

    walk(id, (x) => this.getBlockers(x), true);
    walk(id, (x) => this.getDependents(x), false);

    return { ids, edges };
  }

  /**
   * The earliest deadline among `id` and every unresolved card it transitively blocks: the moment
   * by which `id` really has to be done. Returns null for resolved cards and when there's no date.
   */
  getEffectiveDeadline(id: string): EffectiveDeadline | null {
    const node = this.nodes.get(id);
    if (!node || node.resolved) return null;
    return this.computeDeadline(id, new Set());
  }

  private computeDeadline(id: string, visiting: Set<string>): EffectiveDeadline | null {
    if (this.deadlineCache.has(id)) return this.deadlineCache.get(id);

    // Only reachable when a hand-edited file contains a cycle.
    if (visiting.has(id)) return null;
    visiting.add(id);

    const node = this.nodes.get(id);
    let best: EffectiveDeadline | null = node.deadline ? { ...node.deadline, sourceId: id } : null;

    for (const dependent of this.getDependents(id)) {
      if (this.nodes.get(dependent).resolved) continue;

      const candidate = this.computeDeadline(dependent, visiting);
      if (candidate && (!best || candidate.at < best.at)) best = candidate;
    }

    visiting.delete(id);
    this.deadlineCache.set(id, best);

    return best;
  }
}
