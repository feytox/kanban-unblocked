import { describe, expect, it } from 'vitest';

import { RelationIndex, RelationNode } from './RelationIndex';
import { evaluateAvailability } from './availability';
import { addBlocker, findBlockerPath, prune, removeBlocker, removeCardRelations } from './graph';
import { CardInfo, buildInsights } from './insights';
import { extractRelations, relationsToCodeblock } from './serialize';
import { BoardRelations, hasRelations } from './types';

function chain(...edges: Array<[string, string]>): BoardRelations {
  // [blocked, blocker]
  let rel: BoardRelations = {};
  for (const [blocked, blocker] of edges) {
    const res = addBlocker(rel, blocked, blocker);
    if (!res.ok) throw new Error('unexpected failure ' + JSON.stringify(res));
    rel = res.relations;
  }
  return rel;
}

describe('addBlocker', () => {
  it('adds a relation', () => {
    const res = addBlocker({}, 'a', 'b');
    expect(res).toEqual({
      ok: true,
      changed: true,
      flipped: false,
      relations: { 'blocked-by': { a: ['b'] } },
    });
  });

  it('is a no-op for an existing relation', () => {
    const rel = chain(['a', 'b']);
    const res = addBlocker(rel, 'a', 'b');
    expect(res.ok && res.changed).toBe(false);
    expect(res.ok && res.relations).toBe(rel);
  });

  it('rejects self relations and invalid ids', () => {
    expect(addBlocker({}, 'a', 'a')).toEqual({ ok: false, reason: 'self' });
    expect(addBlocker({}, 'a b', 'c')).toEqual({ ok: false, reason: 'invalid-id' });
    expect(addBlocker({}, 'a', '')).toEqual({ ok: false, reason: 'invalid-id' });
  });

  it('flips a direct reverse relation', () => {
    const rel = chain(['a', 'b']);
    const res = addBlocker(rel, 'b', 'a');
    expect(res).toEqual({
      ok: true,
      changed: true,
      flipped: true,
      relations: { 'blocked-by': { b: ['a'] } },
    });
  });

  it('rejects an indirect cycle and leaves relations untouched', () => {
    // a <- b <- c  (a blocked by b, b blocked by c)
    const rel = chain(['a', 'b'], ['b', 'c']);
    const res = addBlocker(rel, 'c', 'a');
    expect(res).toEqual({ ok: false, reason: 'cycle', cycle: ['a', 'b', 'c', 'a'] });
    expect(rel).toEqual({ 'blocked-by': { a: ['b'], b: ['c'] } });
  });

  it('rejects a flip that would still leave a longer cycle', () => {
    // a blocked by b directly and through c
    const rel = chain(['a', 'b'], ['a', 'c'], ['c', 'b']);
    const res = addBlocker(rel, 'b', 'a');
    expect(res).toMatchObject({ ok: false, reason: 'cycle' });
  });

  it('supports many-to-many relations', () => {
    const rel = chain(['a', 'x'], ['a', 'y'], ['b', 'x'], ['c', 'x']);
    expect(rel['blocked-by']).toEqual({ a: ['x', 'y'], b: ['x'], c: ['x'] });
  });

  it('does not mutate its input', () => {
    const rel = chain(['a', 'b']);
    const snapshot = JSON.stringify(rel);
    addBlocker(rel, 'a', 'c');
    addBlocker(rel, 'b', 'a');
    expect(JSON.stringify(rel)).toBe(snapshot);
  });
});

describe('graph helpers', () => {
  it('finds blocker paths', () => {
    const map = chain(['a', 'b'], ['b', 'c'])['blocked-by'];
    expect(findBlockerPath(map, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(findBlockerPath(map, 'c', 'a')).toBeNull();
  });

  it('removes relations', () => {
    const rel = chain(['a', 'b'], ['a', 'c']);
    expect(removeBlocker(rel, 'a', 'b')).toEqual({ 'blocked-by': { a: ['c'] } });
    expect(removeBlocker(removeBlocker(rel, 'a', 'b'), 'a', 'c')).toEqual({});
    expect(removeBlocker(rel, 'x', 'y')).toBe(rel);
  });

  it('removes every relation of a card', () => {
    const rel = chain(['a', 'b'], ['b', 'c'], ['d', 'b']);
    expect(removeCardRelations(rel, 'b')).toEqual({});
  });

  it('prunes dead, invalid, duplicate and self ids', () => {
    const rel = { 'blocked-by': { a: ['b', 'b', 'gone', 'a', 'bad id'], gone: ['a'] } };
    const alive = new Set(['a', 'b']);
    expect(prune(rel, (id) => alive.has(id))).toEqual({ 'blocked-by': { a: ['b'] } });
  });

  it('returns the same object when pruning changes nothing', () => {
    const rel = chain(['a', 'b']);
    expect(prune(rel, () => true)).toBe(rel);
  });
});

describe('serialization', () => {
  const board = [
    '---',
    '',
    'kanban-plugin: board',
    '',
    '---',
    '',
    '## Todo',
    '',
    '- [ ] a ^a1',
    '- [ ] b ^b1',
    '',
  ].join('\n');
  const settings = '\n\n%% kanban:settings\n```\n{"kanban-plugin":"board"}\n```\n%%';

  it('round-trips', () => {
    const rel = chain(['a1', 'b1']);
    const md = board + relationsToCodeblock(rel) + settings;
    const parsed = extractRelations(md);
    expect(parsed.relations).toEqual(rel);
    expect(parsed.md).toBe(board + settings);
  });

  it('writes nothing for empty relations', () => {
    expect(relationsToCodeblock({})).toBe('');
    expect(relationsToCodeblock(undefined)).toBe('');
    expect(relationsToCodeblock({ 'blocked-by': {} })).toBe('');
  });

  it('leaves boards without a relations block untouched', () => {
    const md = board + settings;
    const parsed = extractRelations(md);
    expect(parsed.md).toBe(md);
    expect(parsed.relations).toEqual({});
  });

  it('survives malformed blocks', () => {
    const md = board + '\n\n%% kanban:relations\n```\n{not json\n```\n%%' + settings;
    const parsed = extractRelations(md);
    expect(parsed.relations).toEqual({});
    expect(parsed.md).toBe(board + settings);
  });

  it('sanitizes unexpected shapes', () => {
    const json = JSON.stringify({
      'blocked-by': { a: ['b', 5, 'a', 'b'], 'bad id': ['x'], c: 'd' },
      unknown: { x: ['y'] },
    });
    const md = board + `\n\n%% kanban:relations\n\`\`\`\n${json}\n\`\`\`\n%%` + settings;
    expect(extractRelations(md).relations).toEqual({ 'blocked-by': { a: ['b'] } });
  });

  it('handles CRLF line endings', () => {
    const md = (board + relationsToCodeblock(chain(['a1', 'b1'])) + settings).replace(
      /\n/g,
      '\r\n'
    );
    const parsed = extractRelations(md);
    expect(parsed.relations).toEqual(chain(['a1', 'b1']));
    expect(parsed.md).not.toContain('kanban:relations');
    expect(parsed.md).toContain('kanban:settings');
  });

  it('reports whether there are relations', () => {
    expect(hasRelations({})).toBe(false);
    expect(hasRelations(chain(['a', 'b']))).toBe(true);
  });
});

const day = 24 * 60 * 60 * 1000;

function index(nodes: RelationNode[], ...edges: Array<[string, string]>) {
  return new RelationIndex(nodes, chain(...edges));
}

describe('RelationIndex', () => {
  const n = (id: string, extra: Partial<RelationNode> = {}): RelationNode => ({
    id,
    resolved: false,
    ...extra,
  });

  it('ignores relations to missing cards', () => {
    const idx = index([n('a')], ['a', 'missing']);
    expect(idx.getBlockers('a')).toEqual([]);
    expect(idx.isBlocked('a')).toBe(false);
  });

  it('treats resolved blockers as not blocking', () => {
    const idx = index([n('a'), n('b', { resolved: true }), n('c')], ['a', 'b'], ['a', 'c']);
    expect(idx.isBlocked('a')).toBe(true);
    expect(idx.getUnresolvedBlockers('a')).toEqual(['c']);

    const done = index([n('a'), n('b', { resolved: true })], ['a', 'b']);
    expect(done.isBlocked('a')).toBe(false);
  });

  it('collects the whole upstream and downstream graph', () => {
    // x <- a <- b <- c,  a <- d,  y (unrelated) <- c
    const idx = index(
      ['a', 'b', 'c', 'd', 'x', 'y'].map((id) => n(id)),
      ['x', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'd'],
      ['y', 'c']
    );
    const graph = idx.getConnected('b');
    expect(Array.from(graph.ids).sort()).toEqual(['a', 'b', 'c', 'x']);
    expect(graph.edges).toContainEqual(['c', 'b']);
    expect(graph.edges).toContainEqual(['b', 'a']);
    expect(graph.edges).toContainEqual(['a', 'x']);
    expect(graph.edges).not.toContainEqual(['d', 'a']);
  });

  it('computes effective deadlines along chains and diamonds', () => {
    const d = (days: number) => ({ at: days * day, hasTime: false });
    // top is blocked by left and right, both blocked by base
    const idx = index(
      [
        n('top', { deadline: d(1) }),
        n('left', { deadline: d(5) }),
        n('right'),
        n('base', { deadline: d(10) }),
      ],
      ['top', 'left'],
      ['top', 'right'],
      ['left', 'base'],
      ['right', 'base']
    );
    expect(idx.getEffectiveDeadline('base')).toEqual({ ...d(1), sourceId: 'top' });
    expect(idx.getEffectiveDeadline('right')).toEqual({ ...d(1), sourceId: 'top' });
    expect(idx.getEffectiveDeadline('top')).toEqual({ ...d(1), sourceId: 'top' });
  });

  it('ignores deadlines of resolved dependents', () => {
    const idx = index(
      [n('a', { deadline: { at: 1, hasTime: true }, resolved: true }), n('b')],
      ['a', 'b']
    );
    expect(idx.getEffectiveDeadline('b')).toBeNull();
  });

  it('survives cycles written into the file by hand', () => {
    const rel = { 'blocked-by': { a: ['b'], b: ['a'] } };
    const idx = new RelationIndex([n('a', { deadline: { at: 1, hasTime: false } }), n('b')], rel);
    expect(idx.getEffectiveDeadline('b')).toEqual({ at: 1, hasTime: false, sourceId: 'a' });
    expect(idx.getConnected('a').ids.size).toBe(2);
  });
});

describe('availability', () => {
  const idx = index(
    [
      { id: 'a', resolved: false },
      { id: 'b', resolved: false },
    ],
    ['a', 'b']
  );

  it('reports blocked cards', () => {
    expect(evaluateAvailability({ blockId: 'a', resolved: false }, { now: 0, index: idx })).toEqual(
      { reasons: ['blocked'], nextChangeAt: undefined }
    );
  });

  it('reports time-blocked cards until they unlock', () => {
    const subject = { resolved: false, unlockAt: 100 };
    expect(evaluateAvailability(subject, { now: 99, index: idx })).toEqual({
      reasons: ['time-blocked'],
      nextChangeAt: 100,
    });
    expect(evaluateAvailability(subject, { now: 100, index: idx }).reasons).toEqual([]);
  });

  it('never dims resolved cards', () => {
    expect(
      evaluateAvailability({ blockId: 'a', resolved: true, unlockAt: 100 }, { now: 0, index: idx })
    ).toEqual({ reasons: [] });
  });
});

describe('buildInsights', () => {
  const card = (key: string, extra: Partial<CardInfo> = {}): CardInfo => ({
    key,
    blockId: key,
    title: key.toUpperCase(),
    resolved: false,
    archived: false,
    ...extra,
  });

  it('builds per-card insights', () => {
    const insights = buildInsights(
      [
        card('a', { deadline: { at: 1 * day, hasTime: false } }),
        card('b', { deadline: { at: 2 * day, hasTime: false } }),
        card('c', { blockId: undefined, unlockAt: 50 }),
        card('d'),
      ],
      chain(['a', 'b']),
      10
    );

    expect(insights.cards.get('a').reasons).toEqual(['blocked']);
    expect(insights.cards.get('a').blockers.map((c) => c.title)).toEqual(['B']);
    expect(insights.cards.get('b').dependents.map((c) => c.key)).toEqual(['a']);
    expect(insights.cards.get('b').inheritedDeadline).toMatchObject({
      at: day,
      sourceId: 'a',
      sourceTitle: 'A',
    });
    expect(insights.cards.get('a').inheritedDeadline).toBeUndefined();
    expect(insights.cards.get('c').reasons).toEqual(['time-blocked']);
    expect(insights.cards.has('d')).toBe(false);
    expect(insights.nextChangeAt).toBe(50);
  });

  it('shows an inherited deadline for cards without a date', () => {
    const insights = buildInsights(
      [card('a', { deadline: { at: day, hasTime: true } }), card('b')],
      chain(['a', 'b']),
      0
    );
    expect(insights.cards.get('b').inheritedDeadline?.sourceId).toBe('a');
  });

  it('treats archived blockers as resolved and skips archived cards', () => {
    const insights = buildInsights(
      [card('a'), card('b', { archived: true })],
      chain(['a', 'b']),
      0
    );
    expect(insights.cards.get('a').reasons).toEqual([]);
    expect(insights.cards.get('a').blockers[0].resolved).toBe(true);
    expect(insights.cards.has('b')).toBe(false);
  });

  it('gives relations only to the first owner of a duplicated block id', () => {
    const insights = buildInsights(
      [card('a'), card('b'), card('b2', { blockId: 'b' })],
      chain(['a', 'b']),
      0
    );
    expect(insights.cards.get('b').dependents).toHaveLength(1);
    expect(insights.cards.has('b2')).toBe(false);
  });
});
