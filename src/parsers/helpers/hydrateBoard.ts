import { moment } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { c, escapeRegExpStr, getDateColorFn } from 'src/components/helpers';
import { Board, DataTypes, DateColor, Item, Lane } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { getEntityFromPath } from 'src/dnd/util/data';
import { Op } from 'src/helpers/patch';
import { t } from 'src/lang/helpers';

import { getSearchValue } from '../common';

export function hydrateLane(stateManager: StateManager, lane: Lane) {
  return lane;
}

export function preprocessTitle(stateManager: StateManager, title: string) {
  const getDateColor = getDateColorFn(stateManager.getSetting('date-colors'));
  const dateTrigger = stateManager.getSetting('date-trigger');
  const dateFormat = stateManager.getSetting('date-format');
  const dateDisplayFormat = stateManager.getSetting('date-display-format');
  const timeTrigger = stateManager.getSetting('time-trigger');
  const timeFormat = stateManager.getSetting('time-format');

  const { app } = stateManager;

  let date: moment.Moment;
  let dateColor: DateColor;
  const getWrapperStyles = (baseClass: string) => {
    let wrapperStyle = '';
    if (dateColor) {
      if (dateColor.backgroundColor) {
        baseClass += ' has-background';
        wrapperStyle = ` style="--date-color: ${dateColor.color}; --date-background-color: ${dateColor.backgroundColor};"`;
      } else {
        wrapperStyle = ` style="--date-color: ${dateColor.color};"`;
      }
    }
    return { wrapperClass: baseClass, wrapperStyle };
  };

  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger)}\\[\\[([^\\]]+)\\]\\]`, 'g'),
    (match, space, content) => {
      const parsed = moment(content, dateFormat);
      if (!parsed.isValid()) return match;
      date = parsed;
      const linkPath = app.metadataCache.getFirstLinkpathDest(content, stateManager.file.path);
      if (!dateColor) dateColor = getDateColor(parsed);
      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-date-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')} ${c('preview-date-link')}"${wrapperStyle}><a class="${c('preview-date')} internal-link" data-href="${linkPath?.path ?? content}" href="${linkPath?.path ?? content}" target="_blank" rel="noopener">${parsed.format(dateDisplayFormat)}</a></span>`;
    }
  );
  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger)}\\[([^\\]]+)\\]\\([^)]+\\)`, 'g'),
    (match, space, content) => {
      const parsed = moment(content, dateFormat);
      if (!parsed.isValid()) return match;
      date = parsed;
      const linkPath = app.metadataCache.getFirstLinkpathDest(content, stateManager.file.path);
      if (!dateColor) dateColor = getDateColor(parsed);
      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-date-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')} ${c('preview-date-link')}"${wrapperStyle}><a class="${c('preview-date')} internal-link" data-href="${linkPath?.path ?? content}" href="${linkPath?.path ?? content}" target="_blank" rel="noopener">${parsed.format(dateDisplayFormat)}</a></span>`;
    }
  );
  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger)}{([^}]+)}`, 'g'),
    (match, space, content) => {
      const parsed = moment(content, dateFormat);
      if (!parsed.isValid()) return match;
      date = parsed;
      if (!dateColor) dateColor = getDateColor(parsed);
      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-date-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')}"${wrapperStyle}><span class="${c('preview-date')} ${c('item-metadata-date')}">${parsed.format(dateDisplayFormat)}</span></span>`;
    }
  );

  const unlockTrigger = stateManager.getSetting('unlock-trigger');
  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(unlockTrigger)}{([^}]+)}`, 'g'),
    (match, space, content) => {
      const parsed = parseUnlockDate(stateManager, content);
      if (!parsed.isValid()) return match;
      const hasTime = parsed.hours() !== 0 || parsed.minutes() !== 0;
      const formatted = parsed.format(
        hasTime ? `${dateDisplayFormat} ${timeFormat}` : dateDisplayFormat
      );
      return `${space}<span class="${c('preview-unlock')}">${t('Hidden until')} ${formatted}</span>`;
    }
  );

  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'g'),
    (match, space, content) => {
      const parsed = moment(content, timeFormat);
      if (!parsed.isValid()) return match;

      if (!date) {
        date = parsed;
        date.year(1970);
      } else {
        date.hour(parsed.hour());
        date.minute(parsed.minute());
        date.second(parsed.second());
      }

      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-time-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')}"${wrapperStyle}><span class="${c('preview-time')} ${c('item-metadata-time')}">${parsed.format(timeFormat)}</span></span>`;
    }
  );

  return title;
}

/** Parses the value of a hide-until token: a date with an optional time. */
export function parseUnlockDate(stateManager: StateManager, str: string) {
  const dateFormat = stateManager.getSetting('date-format');
  const timeFormat = stateManager.getSetting('time-format');

  return moment(
    str.trim(),
    [
      `${dateFormat} ${timeFormat}`,
      `${dateFormat} HH:mm`,
      dateFormat,
      'YYYY-MM-DD HH:mm',
      'YYYY-MM-DDTHH:mm',
      'YYYY-MM-DD',
    ],
    true
  );
}

export function hydrateItem(stateManager: StateManager, item: Item) {
  const { dateStr, timeStr, unlockStr, fileAccessor } = item.data.metadata;

  // Generated values survive board diffs, so clear the ones whose source is gone.
  const unlockAt = unlockStr ? parseUnlockDate(stateManager, unlockStr) : null;
  if (unlockAt?.isValid()) item.data.metadata.unlockAt = unlockAt;
  else delete item.data.metadata.unlockAt;
  if (!dateStr) delete item.data.metadata.date;
  if (!timeStr) delete item.data.metadata.time;

  if (dateStr) {
    item.data.metadata.date = moment(dateStr, stateManager.getSetting('date-format'));
  }

  if (timeStr) {
    let time = moment(timeStr, stateManager.getSetting('time-format'));

    if (item.data.metadata.date) {
      const date = item.data.metadata.date;

      date.hour(time.hour());
      date.minute(time.minute());
      date.second(time.second());

      time = date.clone();
    }

    item.data.metadata.time = time;
  }

  if (fileAccessor) {
    const file = stateManager.app.metadataCache.getFirstLinkpathDest(
      fileAccessor.target,
      stateManager.file.path
    );

    if (file) {
      item.data.metadata.file = file;
    }
  }

  item.data.titleSearch = getSearchValue(item, stateManager);

  return item;
}

export function hydrateBoard(stateManager: StateManager, board: Board): Board {
  try {
    board.children.map((lane) => {
      hydrateLane(stateManager, lane);
      lane.children.map((item) => {
        return hydrateItem(stateManager, item);
      });
    });
  } catch (e) {
    stateManager.setError(e);
    throw e;
  }

  return board;
}

function opAffectsHydration(op: Op) {
  return (
    (op.op === 'add' || op.op === 'replace') &&
    ['title', 'titleRaw', 'dateStr', 'timeStr', 'unlockStr', /\d$/, /\/fileAccessor\/.+$/].some(
      (postFix) => {
        if (typeof postFix === 'string') {
          return op.path.last().toString().endsWith(postFix);
        } else {
          return postFix.test(op.path.last().toString());
        }
      }
    )
  );
}

export function hydratePostOp(stateManager: StateManager, board: Board, ops: Op[]): Board {
  const seen: Record<string, boolean> = {};
  const toHydrate = ops.reduce((paths, op) => {
    if (!opAffectsHydration(op)) {
      return paths;
    }

    const path = op.path.reduce((path, segment) => {
      if (typeof segment === 'number') {
        path.push(segment);
      }

      return path;
    }, [] as Path);

    const key = path.join(',');

    if (!seen[key]) {
      seen[key] = true;
      paths.push(path);
    }

    return paths;
  }, [] as Path[]);

  toHydrate.map((path) => {
    const entity = getEntityFromPath(board, path);

    if (entity.type === DataTypes.Lane) {
      return hydrateLane(stateManager, entity);
    }

    if (entity.type === DataTypes.Item) {
      return hydrateItem(stateManager, entity);
    }
  });

  return board;
}
