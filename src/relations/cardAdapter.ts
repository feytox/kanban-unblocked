import { Item } from 'src/components/types';
import { getTaskStatusDone } from 'src/parsers/helpers/inlineMetadata';

import { CardAdapter } from './RelationStore';

const cancelledChar = '-';

export function isItemResolved(item: Item, laneMarksComplete: boolean) {
  if (laneMarksComplete) return true;
  if (!item.data.checked) return false;

  const { checkChar } = item.data;
  return (
    checkChar === getTaskStatusDone() ||
    checkChar === 'x' ||
    checkChar === 'X' ||
    checkChar === cancelledChar
  );
}

/** First line of the card as plain-ish text, for menus and relation chips. */
export function getItemPlainTitle(item: Item) {
  const firstLine = item.data.titleRaw.split(/\r?\n/)[0];

  const title = firstLine
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)@@?>?[{[]{1,2}[^}\]]*[}\]]{1,2}/g, '$1')
    .replace(/[*_~`=]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return title || firstLine.trim() || '…';
}

export const itemCardAdapter: CardAdapter = {
  isResolved: isItemResolved,
  getTitle: getItemPlainTitle,
};
