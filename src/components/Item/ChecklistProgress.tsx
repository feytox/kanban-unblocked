import { memo, useContext, useMemo } from 'preact/compat';
import { t } from 'src/lang/helpers';
import { useChecklist } from 'src/progress/ChecklistStore';
import { getChecklistProgress } from 'src/progress/checklist';

import { KanbanContext } from '../context';
import { c } from '../helpers';
import { Item } from '../types';

const ringRadius = 5;
const ringLength = 2 * Math.PI * ringRadius;

interface ChecklistProgressProps {
  item: Item;
  /** The card sits in a list that marks items complete. */
  inCompleteList?: boolean;
}

export const ChecklistProgress = memo(function ChecklistProgress({
  item,
  inCompleteList,
}: ChecklistProgressProps) {
  const { stateManager } = useContext(KanbanContext);
  const show = stateManager.useSetting('show-checklist-progress');
  const wholeNote = stateManager.useSetting('checklist-progress-whole-note');
  const inCompleteLists = stateManager.useSetting('checklist-progress-in-complete-lists');

  const { file, fileAccessor } = item.data.metadata;
  const enabled =
    show &&
    (!inCompleteList || inCompleteLists) &&
    !!file &&
    file.extension === 'md' &&
    file !== stateManager.file;

  const parsed = useChecklist(stateManager.checklists, enabled ? file : null);
  const subpath = fileAccessor?.subpath;

  const progress = useMemo(
    () =>
      parsed
        ? getChecklistProgress(parsed, { heading: subpath?.slice(1), wholeNote: !!wholeNote })
        : null,
    [parsed, subpath, wholeNote]
  );

  if (!enabled || !progress?.total) return null;

  const { done, total, heading } = progress;
  const isComplete = done === total;

  return (
    <span
      className={`${c('item-checklist-progress')}${isComplete ? ' is-complete' : ''}`}
      aria-label={`${t('Checklist progress')}: ${done}/${total}${heading ? ` (${heading})` : ''}`}
      data-ignore-drag={true}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        stateManager.app.workspace.openLinkText(
          file.path + (heading ? '#' + heading : ''),
          stateManager.file.path,
          e.ctrlKey || e.metaKey
        );
      }}
    >
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <circle className={c('progress-track')} cx="7" cy="7" r={ringRadius} />
        {done > 0 && (
          <circle
            className={c('progress-value')}
            cx="7"
            cy="7"
            r={ringRadius}
            style={{
              strokeDasharray: ringLength,
              strokeDashoffset: ringLength * (1 - done / total),
            }}
          />
        )}
      </svg>
      {done}/{total}
    </span>
  );
});
