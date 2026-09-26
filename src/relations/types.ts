/**
 * Relations between cards of a single board.
 *
 * Cards are referenced by their Obsidian block id (the `^abc123` suffix of the card's first line).
 * Every relation type maps a subject card to the list of cards it points to, e.g.
 * `{ 'blocked-by': { taskA: ['taskB'] } }` means "taskA is blocked by taskB".
 *
 * New relation types (sub-tasks, "relates to", ...) are added as new keys of `BoardRelations`.
 */
export type RelationType = 'blocked-by';

export const relationTypes: readonly RelationType[] = ['blocked-by'];

export type RelationMap = Record<string, string[]>;

export type BoardRelations = { [K in RelationType]?: RelationMap };

/** Block ids that Obsidian and the parser accept (see `removeBlockId`). */
export const blockIdRegEx = /^[a-zA-Z0-9-]+$/;

export function isValidBlockId(id: unknown): id is string {
  return typeof id === 'string' && blockIdRegEx.test(id);
}

export function emptyRelations(): BoardRelations {
  return {};
}

export function hasRelations(relations: BoardRelations | undefined): boolean {
  if (!relations) return false;
  return relationTypes.some((type) => {
    const map = relations[type];
    return !!map && Object.keys(map).some((k) => map[k].length > 0);
  });
}
