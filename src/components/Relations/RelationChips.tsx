import classcat from 'classcat';
import { memo, useContext } from 'preact/compat';
import { t } from 'src/lang/helpers';
import { RelatedCard } from 'src/relations/insights';

import { KanbanContext } from '../context';
import { c } from '../helpers';
import { focusCard } from './focusCard';

interface RelationRowProps {
  label: string;
  cards: RelatedCard[];
}

function RelationRow({ label, cards }: RelationRowProps) {
  const { view } = useContext(KanbanContext);
  if (!cards.length) return null;

  return (
    <div className={c('item-relation-row')}>
      <span className={c('item-relation-label')}>{label}</span>
      {cards.map((card) => (
        <button
          key={card.blockId}
          className={classcat([c('item-relation-chip'), { 'is-resolved': card.resolved }])}
          aria-label={card.title}
          data-ignore-drag={true}
          onClick={(e) => {
            e.stopPropagation();
            focusCard(view.contentEl, card.key);
          }}
        >
          {card.title}
        </button>
      ))}
    </div>
  );
}

interface RelationChipsProps {
  blockers: RelatedCard[];
  dependents: RelatedCard[];
}

export const RelationChips = memo(function RelationChips({
  blockers,
  dependents,
}: RelationChipsProps) {
  if (!blockers.length && !dependents.length) return null;

  return (
    <div className={c('item-relations')}>
      <RelationRow label={t('Blocked by')} cards={blockers} />
      <RelationRow label={t('Blocks')} cards={dependents} />
    </div>
  );
});
