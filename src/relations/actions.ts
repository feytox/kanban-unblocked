import update from 'immutability-helper';
import { Notice } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Board, Item } from 'src/components/types';
import { t } from 'src/lang/helpers';
import { generateUniqueBlockId, getBoardBlockIds } from 'src/parsers/formats/list';

import { getItemPlainTitle } from './cardAdapter';
import { addBlocker, removeBlocker } from './graph';

type ItemLocation = [laneIndex: number, itemIndex: number];

function findItem(board: Board, key: string): ItemLocation | null {
  for (let l = 0; l < board.children.length; l++) {
    const i = board.children[l].children.findIndex((item) => item.id === key);
    if (i >= 0) return [l, i];
  }
  return null;
}

function getItem(board: Board, [l, i]: ItemLocation): Item {
  return board.children[l].children[i];
}

/** Gives the cards a block id when they don't have one yet, so relations can refer to them. */
function ensureBlockIds(board: Board, locations: ItemLocation[]) {
  const taken = getBoardBlockIds(board);

  for (const location of locations) {
    const item = getItem(board, location);
    if (item.data.blockId) continue;

    const blockId = generateUniqueBlockId(taken);
    taken.add(blockId);

    const [l, i] = location;
    board = update(board, {
      children: { [l]: { children: { [i]: { data: { blockId: { $set: blockId } } } } } },
    });
  }

  return board;
}

/** Makes the card `blockedKey` blocked by the card `blockerKey`. Returns false if refused. */
export function linkBlocker(stateManager: StateManager, blockedKey: string, blockerKey: string) {
  const current = stateManager.state;
  const blockedAt = findItem(current, blockedKey);
  const blockerAt = findItem(current, blockerKey);

  if (!blockedAt || !blockerAt || blockedKey === blockerKey) return false;

  const board = ensureBlockIds(current, [blockedAt, blockerAt]);
  const blocked = getItem(board, blockedAt).data.blockId;
  const blocker = getItem(board, blockerAt).data.blockId;
  const result = addBlocker(board.data.relations ?? {}, blocked, blocker);

  if (result.ok === false) {
    if (result.reason === 'cycle') {
      const cards = stateManager.relations.getInsights()?.byBlockId;
      const names = result.cycle.map((id) => {
        if (id === blocked) return getItemPlainTitle(getItem(board, blockedAt));
        if (id === blocker) return getItemPlainTitle(getItem(board, blockerAt));
        return cards?.get(id)?.title ?? id;
      });
      // The cycle lists each card followed by its blocker; show it as "blocks" arrows.
      new Notice(
        `${t('This relation would create a cycle:')}\n${names.reverse().join(' → ')}`,
        8000
      );
    }
    return false;
  }

  if (!result.changed) return true;

  if (result.flipped) new Notice(t('The relation was reversed'));

  stateManager.setState(update(board, { data: { relations: { $set: result.relations } } }));
  return true;
}

export function unlinkBlocker(stateManager: StateManager, blockedId: string, blockerId: string) {
  const board = stateManager.state;
  const relations = board.data.relations ?? {};
  const next = removeBlocker(relations, blockedId, blockerId);

  if (next !== relations) {
    stateManager.setState(update(board, { data: { relations: { $set: next } } }));
  }
}
