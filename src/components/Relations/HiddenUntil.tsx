import { moment } from 'obsidian';
import { memo, useContext } from 'preact/compat';
import { t } from 'src/lang/helpers';

import { Icon } from '../Icon/Icon';
import { KanbanContext } from '../context';
import { c } from '../helpers';

interface HiddenUntilProps {
  /** Epoch milliseconds; nothing is shown once the card is available. */
  until?: number;
  /** Lets the user pick another date. */
  onClick?: (e: MouseEvent) => void;
}

export const HiddenUntil = memo(function HiddenUntil({ until, onClick }: HiddenUntilProps) {
  const { stateManager } = useContext(KanbanContext);
  const moveDates = stateManager.useSetting('move-dates');
  const dateDisplayFormat = stateManager.useSetting('date-display-format');
  const timeFormat = stateManager.useSetting('time-format');
  const show = stateManager.useSetting('show-hidden-until');

  // Without "move dates", the token is rendered inside the card text instead.
  if (until === undefined || !moveDates || !show) return null;

  const m = moment(until);
  const hasTime = m.hours() !== 0 || m.minutes() !== 0;

  return (
    <span
      className={`${c('item-hidden-until')}${onClick ? ' is-clickable' : ''}`}
      data-ignore-drag={onClick ? true : undefined}
      onPointerDown={onClick ? (e) => e.stopPropagation() : undefined}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick(e);
            }
          : undefined
      }
      aria-label={onClick ? t('Hide until...') : undefined}
    >
      <Icon name="lucide-hourglass" />
      {t('Hidden until')}{' '}
      {m.format(hasTime ? `${dateDisplayFormat} ${timeFormat}` : dateDisplayFormat)}
    </span>
  );
});
