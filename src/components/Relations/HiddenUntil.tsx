import { moment } from 'obsidian';
import { memo, useContext } from 'preact/compat';
import { t } from 'src/lang/helpers';

import { Icon } from '../Icon/Icon';
import { KanbanContext } from '../context';
import { c } from '../helpers';

interface HiddenUntilProps {
  /** Epoch milliseconds; nothing is shown once the card is available. */
  until?: number;
}

export const HiddenUntil = memo(function HiddenUntil({ until }: HiddenUntilProps) {
  const { stateManager } = useContext(KanbanContext);
  const moveDates = stateManager.useSetting('move-dates');
  const dateDisplayFormat = stateManager.useSetting('date-display-format');
  const timeFormat = stateManager.useSetting('time-format');

  // Without "move dates", the token is rendered inside the card text instead.
  if (until === undefined || !moveDates) return null;

  const m = moment(until);
  const hasTime = m.hours() !== 0 || m.minutes() !== 0;

  return (
    <span className={c('item-hidden-until')}>
      <Icon name="lucide-hourglass" />
      {t('Hidden until')}{' '}
      {m.format(hasTime ? `${dateDisplayFormat} ${timeFormat}` : dateDisplayFormat)}
    </span>
  );
});
