import { Item } from 'src/components/types';
import { getTaskStatusDone } from 'src/parsers/helpers/inlineMetadata';

import { CardAdapter } from './RelationStore';

const cancelledChar = '-';

export function isItemResolved(
  item: Item,
  laneMarksComplete: boolean,
  checkboxesShown: boolean = true
) {
  if (laneMarksComplete) return true;
  // A hidden checkbox can't be seen or toggled, so it must not silently resolve the card.
  if (!checkboxesShown || !item.data.checked) return false;

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

export function createItemCardAdapter(getCheckboxesShown: () => boolean): CardAdapter {
  return {
    isResolved: (item, laneMarksComplete) =>
      isItemResolved(item, laneMarksComplete, getCheckboxesShown()),
    getTitle: getItemPlainTitle,
  };
}
