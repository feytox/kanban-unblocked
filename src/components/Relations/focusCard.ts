import { c } from '../helpers';

const flashDuration = 1200;

/** Scrolls a card into view and briefly highlights it. */
export function focusCard(root: HTMLElement, itemId: string) {
  const el = root.querySelector<HTMLElement>(`.${c('item')}[data-item-id="${CSS.escape(itemId)}"]`);
  if (!el) return;

  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  el.removeClass('is-flashing');
  // Restart the animation when the same card is focused twice in a row.
  void el.offsetWidth;
  el.addClass('is-flashing');
  el.win.setTimeout(() => el.removeClass('is-flashing'), flashDuration);
}
