import { useContext } from 'preact/compat';
import { Path } from 'src/dnd/types';
import { t } from 'src/lang/helpers';

import { KanbanContext } from '../context';
import { c } from '../helpers';
import { EditState, Lane, isEditing } from '../types';

export interface LaneSettingsProps {
  lane: Lane;
  lanePath: Path;
  editState: EditState;
}

export function LaneSettings({ lane, lanePath, editState }: LaneSettingsProps) {
  const { boardModifiers } = useContext(KanbanContext);

  if (!isEditing(editState)) return null;

  return (
    <div className={c('lane-setting-wrapper')}>
      <div className={c('checkbox-wrapper')}>
        <div className={c('checkbox-label')}>{t('Mark cards in this list as complete')}</div>
        <div
          onClick={() =>
            boardModifiers.setLaneFlag(
              lanePath,
              'shouldMarkItemsComplete',
              !lane.data.shouldMarkItemsComplete
            )
          }
          className={`checkbox-container ${lane.data.shouldMarkItemsComplete ? 'is-enabled' : ''}`}
        />
      </div>
      <div className={c('checkbox-wrapper')}>
        <div className={c('checkbox-label')}>{t("Cards in this list don't block other cards")}</div>
        <div
          onClick={() =>
            boardModifiers.setLaneFlag(lanePath, 'resolvesBlockers', !lane.data.resolvesBlockers)
          }
          className={`checkbox-container ${lane.data.resolvesBlockers ? 'is-enabled' : ''}`}
        />
      </div>
    </div>
  );
}
