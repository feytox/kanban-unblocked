import { BoardRelations, RelationMap, hasRelations, isValidBlockId, relationTypes } from './types';

export const relationsBlockMarker = '%% kanban:relations';

const relationsBlockRegEx =
  /(^|\r?\n)(?:[ \t]*\r?\n)*%% kanban:relations[ \t]*\r?\n```[^\r\n]*\r?\n([\s\S]*?)\r?\n?```[ \t]*\r?\n%%[ \t]*(?=\r?\n|$)/g;

function sanitize(raw: unknown): BoardRelations {
  const relations: BoardRelations = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return relations;

  for (const type of relationTypes) {
    const map = (raw as Record<string, unknown>)[type];
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;

    const clean: RelationMap = {};
    for (const [subject, targets] of Object.entries(map)) {
      if (!isValidBlockId(subject) || !Array.isArray(targets)) continue;
      const valid = Array.from(new Set(targets.filter(isValidBlockId))).filter(
        (id) => id !== subject
      );
      if (valid.length) clean[subject] = valid;
    }

    if (Object.keys(clean).length) relations[type] = clean;
  }

  return relations;
}

/**
 * Finds the relations block in a board file and returns the parsed relations together with the
 * markdown without that block, so the rest of the parser never sees it. A malformed block yields
 * empty relations instead of breaking the whole board.
 */
export function extractRelations(md: string): { relations: BoardRelations; md: string } {
  let relations: BoardRelations = {};
  let found = false;

  const stripped = md.replace(relationsBlockRegEx, (_match, lead: string, body: string) => {
    if (!found) {
      found = true;
      try {
        relations = sanitize(JSON.parse(body.trim() || '{}'));
      } catch (e) {
        console.warn('Kanban: could not parse the relations block', e);
      }
    }
    return lead;
  });

  return { relations, md: found ? stripped : md };
}

export function relationsToCodeblock(relations: BoardRelations | undefined): string {
  if (!hasRelations(relations)) return '';

  return ['', '', relationsBlockMarker, '```', JSON.stringify(relations), '```', '%%'].join('\n');
}
