import { BoardRelations, RelationMap, isValidBlockId, relationTypes } from './types';

/*
 * Immutable operations on the `blocked-by` relation. Every function returns a new
 * `BoardRelations` object (or the same one when nothing changed) and never mutates its input.
 */

export type AddBlockerResult =
  | { ok: true; relations: BoardRelations; changed: boolean; flipped: boolean }
  | { ok: false; reason: 'self' | 'invalid-id' }
  | { ok: false; reason: 'cycle'; cycle: string[] };

export function getBlockers(relations: BoardRelations, id: string): string[] {
  return relations['blocked-by']?.[id] ?? [];
}

function withMap(relations: BoardRelations, map: RelationMap): BoardRelations {
  const next: BoardRelations = { ...relations };
  if (Object.keys(map).length) {
    next['blocked-by'] = map;
  } else {
    delete next['blocked-by'];
  }
  return next;
}

function removeEdge(map: RelationMap, blocked: string, blocker: string): RelationMap {
  const blockers = map[blocked];
  if (!blockers?.includes(blocker)) return map;

  const next = { ...map };
  const remaining = blockers.filter((id) => id !== blocker);
  if (remaining.length) next[blocked] = remaining;
  else delete next[blocked];
  return next;
}

/**
 * Returns the chain `[from, ..., to]` if `to` is reachable from `from` by following
 * "is blocked by" edges, i.e. if `to` transitively blocks `from`.
 */
export function findBlockerPath(map: RelationMap, from: string, to: string): string[] | null {
  const parent = new Map<string, string>();
  const stack = [from];
  const seen = new Set([from]);

  while (stack.length) {
    const current = stack.pop();
    if (current === to) {
      const path = [to];
      let step = to;
      while (step !== from) {
        step = parent.get(step);
        path.push(step);
      }
      return path.reverse();
    }

    for (const next of map[current] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      parent.set(next, current);
      stack.push(next);
    }
  }

  return null;
}

/**
 * Marks `blocked` as blocked by `blocker`.
 *
 * - If `blocker` is currently blocked by `blocked`, the existing relation is flipped.
 * - If the new relation would close a longer cycle, nothing changes and the cycle is returned
 *   as `[blocker, ..., blocked, blocker]` (each card blocked by the next one).
 */
export function addBlocker(
  relations: BoardRelations,
  blocked: string,
  blocker: string
): AddBlockerResult {
  if (!isValidBlockId(blocked) || !isValidBlockId(blocker)) {
    return { ok: false, reason: 'invalid-id' };
  }

  if (blocked === blocker) {
    return { ok: false, reason: 'self' };
  }

  let map = relations['blocked-by'] ?? {};

  if (map[blocked]?.includes(blocker)) {
    return { ok: true, relations, changed: false, flipped: false };
  }

  const flipped = !!map[blocker]?.includes(blocked);
  if (flipped) {
    map = removeEdge(map, blocker, blocked);
  }

  // `blocked -> blocker` closes a cycle if `blocked` already (transitively) blocks `blocker`.
  const path = findBlockerPath(map, blocker, blocked);
  if (path) {
    return { ok: false, reason: 'cycle', cycle: [...path, blocker] };
  }

  map = { ...map, [blocked]: [...(map[blocked] ?? []), blocker] };

  return { ok: true, relations: withMap(relations, map), changed: true, flipped };
}

export function removeBlocker(
  relations: BoardRelations,
  blocked: string,
  blocker: string
): BoardRelations {
  const map = relations['blocked-by'];
  if (!map) return relations;

  const next = removeEdge(map, blocked, blocker);
  return next === map ? relations : withMap(relations, next);
}

/** Removes every relation of `id`, in both directions. */
export function removeCardRelations(relations: BoardRelations, id: string): BoardRelations {
  return prune(relations, (candidate) => candidate !== id);
}

/**
 * Drops ids that aren't alive, invalid ids, self references and duplicates. Returns the same
 * object when nothing had to change so callers can cheaply detect no-ops.
 */
export function prune(relations: BoardRelations, isAlive: (id: string) => boolean): BoardRelations {
  let changed = false;
  const next: BoardRelations = {};

  for (const type of relationTypes) {
    const map = relations[type];
    if (!map) continue;

    const nextMap: RelationMap = {};

    for (const subject of Object.keys(map)) {
      const targets = map[subject];

      if (!isValidBlockId(subject) || !isAlive(subject) || !Array.isArray(targets)) {
        changed = true;
        continue;
      }

      const seen = new Set<string>();
      const kept = targets.filter((target) => {
        if (!isValidBlockId(target) || target === subject || seen.has(target)) return false;
        seen.add(target);
        return isAlive(target);
      });

      if (kept.length !== targets.length) changed = true;
      if (kept.length) nextMap[subject] = kept;
    }

    if (Object.keys(nextMap).length) next[type] = nextMap;
    else changed = true;
  }

  return changed ? next : relations;
}
