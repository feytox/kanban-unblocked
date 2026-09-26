import { useContext, useEffect } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { DndManagerContext } from 'src/dnd/components/context';
import { DragEventData } from 'src/dnd/managers/DragManager';
import { t } from 'src/lang/helpers';
import { linkBlocker } from 'src/relations/actions';

import { c } from '../helpers';
import { DataTypes } from '../types';

const svgNS = 'http://www.w3.org/2000/svg';
const hoverDelay = 120;
const itemClass = c('item');
const dragContainerClass = c('drag-container');

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** The card is scrolled out of its list; the box is pinned to the list's edge. */
  offscreen: boolean;
}

function findCard(root: HTMLElement, key: string, dragging: boolean): HTMLElement | null {
  const selector = `.${itemClass}[data-item-id="${CSS.escape(key)}"]`;

  if (dragging) {
    const dragged = root.doc.querySelector<HTMLElement>(`.${dragContainerClass} ${selector}`);
    if (dragged) return dragged;
  }

  return root.querySelector<HTMLElement>(selector);
}

/** The visible area of the closest ancestor (below the board root) that scrolls vertically. */
function getVerticalClip(el: HTMLElement, root: HTMLElement): DOMRect | null {
  for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
    if (node.scrollHeight <= node.clientHeight + 1) continue;

    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
      return node.getBoundingClientRect();
    }
  }
  return null;
}

function measure(
  el: HTMLElement,
  root: HTMLElement,
  origin: DOMRect,
  isDragged: boolean
): Box | null {
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;

  const { left, right } = rect;
  let { top, bottom } = rect;
  let offscreen = false;

  if (!isDragged) {
    const clip = getVerticalClip(el, root);

    if (clip && (bottom < clip.top || top > clip.bottom)) {
      offscreen = true;
      const edge = bottom < clip.top ? clip.top : clip.bottom;
      top = bottom = edge;
    } else if (clip) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }

  return {
    left: left - origin.left,
    right: right - origin.left,
    top: top - origin.top,
    bottom: bottom - origin.top,
    offscreen,
  };
}

/** A curve from the blocker to the blocked card. */
function connectorPath(from: Box, to: Box) {
  const fromCenterY = (from.top + from.bottom) / 2;
  const toCenterY = (to.top + to.bottom) / 2;
  const overlapX = Math.min(from.right, to.right) - Math.max(from.left, to.left);

  if (overlapX > 0) {
    // Same column: leave and enter on the right side, bulging outwards.
    const x1 = from.right;
    const x2 = to.right;
    const bulge = Math.max(x1, x2) + 16 + Math.min(Math.abs(toCenterY - fromCenterY) / 5, 36);
    return `M ${x1} ${fromCenterY} C ${bulge} ${fromCenterY}, ${bulge} ${toCenterY}, ${x2 + 2} ${toCenterY}`;
  }

  const leftToRight = from.right <= to.left;
  const x1 = leftToRight ? from.right : from.left;
  const x2 = leftToRight ? to.left - 2 : to.right + 2;
  const dx = Math.max(Math.abs(x2 - x1) / 2, 24) * (leftToRight ? 1 : -1);

  return `M ${x1} ${fromCenterY} C ${x1 + dx} ${fromCenterY}, ${x2 - dx} ${toCenterY}, ${x2} ${toCenterY}`;
}

interface LinkingState {
  sourceKey: string;
  pointerId: number;
  x: number;
  y: number;
  targetKey: string | null;
}

class OverlayController {
  private svg: SVGSVGElement;
  private layer: SVGGElement;
  /** Grab this to draw a new relation from the hovered card to another one. */
  private handle: HTMLElement;
  private handleKey: string | null = null;
  private linking: LinkingState | null = null;
  private focusKey: string | null = null;
  private dragging = false;
  private frame: number | null = null;
  private hoverTimer: number | null = null;
  private cleanup: Array<() => void> = [];

  constructor(
    private root: HTMLElement,
    private stateManager: StateManager
  ) {
    const doc = root.doc;
    this.svg = doc.createElementNS(svgNS, 'svg');
    this.svg.addClass(c('relation-overlay'));
    this.svg.setAttribute('aria-hidden', 'true');

    const defs = doc.createElementNS(svgNS, 'defs');
    defs.appendChild(this.createMarker('open'));
    defs.appendChild(this.createMarker('resolved'));
    this.svg.appendChild(defs);

    this.layer = doc.createElementNS(svgNS, 'g');
    this.svg.appendChild(this.layer);
    root.appendChild(this.svg);

    this.handle = root.createDiv({
      cls: c('link-handle'),
      attr: {
        'aria-label': t('Drag onto a card that this one blocks'),
        'data-ignore-drag': 'true',
      },
    });
    this.handle.hide();
    this.listen(this.handle, 'pointerdown', this.onHandlePointerDown);
    this.listen(this.handle, 'pointermove', this.onHandlePointerMove);
    this.listen(this.handle, 'pointerup', this.onHandlePointerUp);
    this.listen(this.handle, 'pointercancel', this.cancelLinking);
    this.listen(this.handle, 'lostpointercapture', this.cancelLinking);
    this.listen(root.doc, 'keydown', this.onKeyDown, { capture: true });

    this.listen(root, 'pointerover', this.onPointerOver);
    this.listen(root, 'pointerleave', this.onPointerLeave);
    this.listen(root, 'scroll', this.requestDraw, { capture: true, passive: true });
    this.listen(root.win, 'resize', this.requestDraw, { passive: true });

    // Layout can change without a window resize, e.g. when a sidebar is toggled.
    const resizeObserver = new (root.win as typeof window).ResizeObserver(this.requestDraw);
    resizeObserver.observe(root);
    this.cleanup.push(() => resizeObserver.disconnect());
    this.cleanup.push(stateManager.relations.subscribe(this.requestDraw));
  }

  private createMarker(kind: 'open' | 'resolved') {
    const marker = this.root.doc.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', this.markerId(kind));
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');

    const head = this.root.doc.createElementNS(svgNS, 'path');
    head.setAttribute('d', 'M 0 1 L 9 5 L 0 9 z');
    head.addClass(c('relation-arrowhead'), `is-${kind}`);
    marker.appendChild(head);

    return marker;
  }

  private markerId(kind: string) {
    // Several boards can be open at once, each with its own overlay.
    return `${c('relation-arrow')}-${kind}-${this.stateManager.file.path.replace(/[^\w-]/g, '_')}`;
  }

  private listen(
    target: EventTarget,
    type: string,
    fn: (e: Event) => void,
    options?: AddEventListenerOptions
  ) {
    target.addEventListener(type, fn, options);
    this.cleanup.push(() => target.removeEventListener(type, fn, options));
  }

  private hasRelations(key: string) {
    const insight = this.stateManager.relations.getCardInsight(key);
    return insight.blockers.length > 0 || insight.dependents.length > 0;
  }

  private onPointerOver = (e: PointerEvent) => {
    if (this.dragging || this.linking || e.pointerType === 'touch') return;
    // Moving onto the handle keeps the card it belongs to hovered.
    if (this.handle.contains(e.target as Node)) return;

    const card = (e.target as Element).closest?.(`.${itemClass}[data-item-id]`) as HTMLElement;
    this.setHandleCard(card && !card.querySelector('.cm-editor') ? card.dataset.itemId : null);

    const key = card && this.hasRelations(card.dataset.itemId) ? card.dataset.itemId : null;

    if (key === this.focusKey) {
      this.clearHoverTimer();
      if (key) this.requestDraw();
      return;
    }

    this.clearHoverTimer();
    this.hoverTimer = this.root.win.setTimeout(() => {
      this.hoverTimer = null;
      this.setFocus(key);
    }, hoverDelay);
  };

  private onPointerLeave = () => {
    if (this.dragging || this.linking) return;
    this.clearHoverTimer();
    this.setHandleCard(null);
    this.setFocus(null);
  };

  private setHandleCard(key: string | null) {
    if (key === this.handleKey) return;
    this.handleKey = key;
    this.requestDraw();
  }

  private positionHandle(origin: DOMRect) {
    const el = this.handleKey && !this.dragging && findCard(this.root, this.handleKey, false);
    const box = el && measure(el, this.root, origin, false);

    if (!box || box.offscreen) {
      this.handle.hide();
      return;
    }

    this.handle.style.left = `${box.right + 4}px`;
    this.handle.style.top = `${(box.top + box.bottom) / 2}px`;
    this.handle.show();
  }

  private findTargetKey(x: number, y: number, sourceKey: string) {
    const hit = this.root.doc.elementFromPoint(x, y);
    const card = hit?.closest?.(`.${itemClass}[data-item-id]`) as HTMLElement;
    if (!card || !this.root.contains(card)) return null;
    const key = card.dataset.itemId;
    return key === sourceKey ? null : key;
  }

  private onHandlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.handleKey) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      this.handle.setPointerCapture(e.pointerId);
    } catch (err) {
      // The pointer may already be gone; linking still works without capture.
    }
    this.handle.addClass('is-linking');
    this.clearHoverTimer();
    this.linking = {
      sourceKey: this.handleKey,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      targetKey: null,
    };
    this.requestDraw();
  };

  private onHandlePointerMove = (e: PointerEvent) => {
    const linking = this.linking;
    if (!linking || e.pointerId !== linking.pointerId) return;

    linking.x = e.clientX;
    linking.y = e.clientY;
    linking.targetKey = this.findTargetKey(e.clientX, e.clientY, linking.sourceKey);
    this.requestDraw();
  };

  private onHandlePointerUp = (e: PointerEvent) => {
    const linking = this.linking;
    if (!linking || e.pointerId !== linking.pointerId) return;

    const targetKey = this.findTargetKey(e.clientX, e.clientY, linking.sourceKey);
    this.stopLinking();

    // Dragging from A onto B means "A blocks B", the same direction the arrows are drawn in.
    if (targetKey) linkBlocker(this.stateManager, targetKey, linking.sourceKey);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.linking && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancelLinking();
    }
  };

  private cancelLinking = () => {
    if (this.linking) this.stopLinking();
  };

  private stopLinking() {
    const { pointerId } = this.linking;
    this.linking = null;
    this.handle.removeClass('is-linking');
    if (this.handle.hasPointerCapture(pointerId)) this.handle.releasePointerCapture(pointerId);
    this.requestDraw();
  }

  onDragStart = ({ dragEntity }: DragEventData) => {
    const data = dragEntity?.getData();
    this.clearHoverTimer();

    if (data?.type !== DataTypes.Item || !this.hasRelations(data.id)) {
      this.dragging = false;
      this.setFocus(null);
      return;
    }

    this.dragging = true;
    this.setFocus(data.id);
  };

  onDragMove = () => {
    if (this.dragging) this.requestDraw();
  };

  onDragEnd = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.setFocus(null);
  };

  private clearHoverTimer() {
    if (this.hoverTimer !== null) {
      this.root.win.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  private setFocus(key: string | null) {
    if (key === this.focusKey) return;
    this.focusKey = key;
    this.requestDraw();
  }

  private requestDraw = () => {
    if (this.frame !== null) return;
    this.frame = this.root.win.requestAnimationFrame(() => {
      this.frame = null;
      this.draw();
    });
  };

  private draw() {
    const origin = this.root.getBoundingClientRect();
    this.positionHandle(origin);

    if (this.linking) {
      this.layer.empty();
      this.drawLinking(origin);
      return;
    }

    const key = this.focusKey;
    if (!key && !this.layer.hasChildNodes()) return;

    this.layer.empty();

    const insights = this.stateManager.relations.getInsights();
    if (!key || !insights) return;

    const focusBlockId = this.findBlockId(key);
    if (!focusBlockId) return;

    const { ids, edges } = insights.index.getConnected(focusBlockId);
    const boxes = new Map<string, Box>();

    for (const blockId of ids) {
      const card = insights.byBlockId.get(blockId);
      if (!card || card.archived) continue;

      const isDragged = this.dragging && card.key === key;
      const el = findCard(this.root, card.key, isDragged);
      const box = el && measure(el, this.root, origin, isDragged);
      if (box) boxes.set(blockId, box);
    }

    const doc = this.root.doc;

    for (const [blockId, box] of boxes) {
      if (!box.offscreen) this.drawOutline(box, blockId === focusBlockId ? 'is-focus' : null);
    }

    for (const [blocker, blocked] of edges) {
      const from = boxes.get(blocker);
      const to = boxes.get(blocked);
      // Neither card is visible: an edge between two list edges would only add noise.
      if (!from || !to || (from.offscreen && to.offscreen)) continue;

      const resolved = insights.index.getNode(blocker).resolved;
      const path = doc.createElementNS(svgNS, 'path');
      path.setAttribute('d', connectorPath(from, to));
      path.setAttribute('marker-end', `url(#${this.markerId(resolved ? 'resolved' : 'open')})`);
      path.addClass(c('relation-edge'));
      if (resolved) path.addClass('is-resolved');
      if (from.offscreen || to.offscreen) path.addClass('is-offscreen');
      this.layer.appendChild(path);
    }
  }

  private drawOutline(box: Box, modifier: string | null) {
    const rect = this.root.doc.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', String(box.left - 2));
    rect.setAttribute('y', String(box.top - 2));
    rect.setAttribute('width', String(box.right - box.left + 4));
    rect.setAttribute('height', String(box.bottom - box.top + 4));
    rect.setAttribute('rx', '6');
    rect.addClass(c('relation-outline'));
    if (modifier) rect.addClass(modifier);
    this.layer.appendChild(rect);
  }

  private drawLinking(origin: DOMRect) {
    const { sourceKey, targetKey, x, y } = this.linking;
    const sourceEl = findCard(this.root, sourceKey, false);
    const source = sourceEl && measure(sourceEl, this.root, origin, false);
    if (!source) return;

    this.drawOutline(source, 'is-focus');

    const targetEl = targetKey && findCard(this.root, targetKey, false);
    const target = targetEl && measure(targetEl, this.root, origin, false);
    if (target) this.drawOutline(target, 'is-link-target');

    const px = x - origin.left;
    const py = y - origin.top;
    const pointer: Box = { left: px, right: px, top: py, bottom: py, offscreen: false };

    const path = this.root.doc.createElementNS(svgNS, 'path');
    path.setAttribute('d', connectorPath(source, target || pointer));
    path.setAttribute('marker-end', `url(#${this.markerId('open')})`);
    path.addClass(c('relation-edge'), 'is-draft');
    this.layer.appendChild(path);
  }

  private findBlockId(key: string) {
    const el = findCard(this.root, key, this.dragging);
    return el?.dataset.blockId || null;
  }

  destroy() {
    this.clearHoverTimer();
    if (this.frame !== null) this.root.win.cancelAnimationFrame(this.frame);
    this.cleanup.forEach((fn) => fn());
    this.svg.remove();
    this.handle.remove();
  }
}

interface RelationOverlayProps {
  rootRef: { current: HTMLElement | null };
  stateManager: StateManager;
}

/**
 * Draws arrows between related cards while one of them is hovered or dragged. It works
 * imperatively on a single SVG element, so hovering and dragging never re-render the board.
 */
export function RelationOverlay({ rootRef, stateManager }: RelationOverlayProps): null {
  const dndManager = useContext(DndManagerContext);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const overlay = new OverlayController(root, stateManager);

    const emitter = dndManager?.dragManager.emitter;
    emitter?.on('dragStart', overlay.onDragStart);
    emitter?.on('dragMove', overlay.onDragMove);
    emitter?.on('dragEnd', overlay.onDragEnd);

    return () => {
      emitter?.off('dragStart', overlay.onDragStart);
      emitter?.off('dragMove', overlay.onDragMove);
      emitter?.off('dragEnd', overlay.onDragEnd);
      overlay.destroy();
    };
  }, [stateManager, dndManager]);

  return null;
}
