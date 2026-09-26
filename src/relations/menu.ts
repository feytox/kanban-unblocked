import { Menu, moment } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { constructDatePicker } from 'src/components/Item/helpers';
import { escapeRegExpStr } from 'src/components/helpers';
import { Item } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { BoardModifiers } from 'src/helpers/boardModifiers';
import { t } from 'src/lang/helpers';

import { CardChoice, CardSuggestModal } from './CardSuggestModal';
import { linkBlocker, unlinkBlocker } from './actions';
import { getItemPlainTitle } from './cardAdapter';

function otherCards(stateManager: StateManager, item: Item, exclude: Set<string>) {
  const choices: Array<{ card: Item; lane: string }> = [];

  for (const lane of stateManager.state.children) {
    for (const card of lane.children) {
      if (card.id === item.id) continue;
      if (card.data.blockId && exclude.has(card.data.blockId)) continue;
      choices.push({ card, lane: lane.data.title });
    }
  }

  return choices;
}

export function addRelationMenuItems(menu: Menu, stateManager: StateManager, item: Item) {
  const { app } = stateManager;
  const insight = stateManager.relations.getCardInsight(item.id);

  menu.addItem((i) => {
    i.setIcon('lucide-lock')
      .setTitle(t('Add blocker...'))
      .onClick(() => {
        const exclude = new Set(insight.blockers.map((b) => b.blockId));
        const choices: CardChoice[] = otherCards(stateManager, item, exclude).map(
          ({ card, lane }) => ({
            title: getItemPlainTitle(card),
            note: lane,
            onChoose: () => linkBlocker(stateManager, item.id, card.id),
          })
        );

        new CardSuggestModal(app, choices, t('Choose the card that blocks this one')).open();
      });
  });

  menu.addItem((i) => {
    i.setIcon('lucide-arrow-right')
      .setTitle(t('Blocks...'))
      .onClick(() => {
        const exclude = new Set(insight.dependents.map((d) => d.blockId));
        const choices: CardChoice[] = otherCards(stateManager, item, exclude).map(
          ({ card, lane }) => ({
            title: getItemPlainTitle(card),
            note: lane,
            onChoose: () => linkBlocker(stateManager, card.id, item.id),
          })
        );

        new CardSuggestModal(app, choices, t('Choose the card that this one blocks')).open();
      });
  });

  const blockId = item.data.blockId;
  if (!blockId || (!insight.blockers.length && !insight.dependents.length)) return;

  menu.addItem((i) => {
    i.setIcon('lucide-unlink')
      .setTitle(t('Remove relation...'))
      .onClick(() => {
        const choices: CardChoice[] = [
          ...insight.blockers.map((blocker) => ({
            title: blocker.title,
            note: t('Blocked by'),
            onChoose: () => unlinkBlocker(stateManager, blockId, blocker.blockId),
          })),
          ...insight.dependents.map((dependent) => ({
            title: dependent.title,
            note: t('Blocks'),
            onChoose: () => unlinkBlocker(stateManager, dependent.blockId, blockId),
          })),
        ];

        new CardSuggestModal(app, choices, t('Choose a relation to remove')).open();
      });
  });
}

interface HideUntilMenuParams {
  menu: Menu;
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  path: Path;
  win: Window;
  coordinates: { x: number; y: number };
}

export function addHideUntilMenuItems({
  menu,
  stateManager,
  boardModifiers,
  item,
  path,
  win,
  coordinates,
}: HideUntilMenuParams) {
  const trigger = stateManager.getSetting('unlock-trigger');
  const tokenRegEx = new RegExp(`(^|\\s)${escapeRegExpStr(trigger)}{[^}]*}`);
  const hasToken = !!item.data.metadata.unlockStr;

  const setTitle = (titleRaw: string) => {
    boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
  };

  menu.addItem((i) => {
    i.setIcon('lucide-hourglass')
      .setTitle(t('Hide until...'))
      .onClick(() => {
        const current = item.data.metadata.unlockAt;
        const initial = current?.isValid() ? current : moment().add(1, 'day').startOf('day');

        constructDatePicker(
          win,
          stateManager,
          coordinates,
          (dates) => {
            const token = `${trigger}{${moment(dates[0]).format(stateManager.getSetting('date-format'))}}`;
            const titleRaw = hasToken
              ? item.data.titleRaw.replace(tokenRegEx, `$1${token}`)
              : `${item.data.titleRaw} ${token}`;
            setTitle(titleRaw);
          },
          initial.toDate()
        );
      });
  });

  if (hasToken) {
    menu.addItem((i) => {
      i.setIcon('lucide-eye')
        .setTitle(t('Show now'))
        .onClick(() => setTitle(item.data.titleRaw.replace(tokenRegEx, '').trim()));
    });
  }
}
