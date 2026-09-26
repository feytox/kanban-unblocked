import { moment } from 'obsidian';
import { memo, useContext } from 'preact/compat';
import { t } from 'src/lang/helpers';
import { CardInsight } from 'src/relations/insights';

import { Icon } from '../Icon/Icon';
import { KanbanContext } from '../context';
import { c } from '../helpers';

interface InheritedDeadlineProps {
  deadline?: CardInsight['inheritedDeadline'];
}

/** The earlier deadline of a card this one blocks. The card's own date is left untouched. */
export const InheritedDeadline = memo(function InheritedDeadline({
  deadline,
}: InheritedDeadlineProps) {
  const { stateManager } = useContext(KanbanContext);
  const dateDisplayFormat = stateManager.useSetting('date-display-format');
  const timeFormat = stateManager.useSetting('time-format');

  if (!deadline) return null;

  const format = deadline.hasTime ? `${dateDisplayFormat} ${timeFormat}` : dateDisplayFormat;

  return (
    <span
      className={c('item-inherited-deadline')}
      aria-label={`${t('Needed earlier for')}: ${deadline.sourceTitle}`}
    >
      <Icon name="lucide-alarm-clock" />
      {t('Needed by')} {moment(deadline.at).format(format)}
    </span>
  );
});
