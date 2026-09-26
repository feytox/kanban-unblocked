import { useContext, useEffect } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { DndManagerContext } from 'src/dnd/components/context';
import { DragEventData } from 'src/dnd/managers/DragManager';

import { c } from '../helpers';
import { DataTypes } from '../types';

const svgNS = 'http://www.w3.org/2000/svg';
const hoverDelay = 120;
const itemClass = c('item');
const dragContainerClass = c('drag-container');
const laneItemsClass = c('lane-items');

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

function measure(el: HTMLElement, origin: DOMRect, isDragged: boolean): Box | null {
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;

  const { left, right } = rect;
  let { top, bottom } = rect;
  let offscreen = false;

  if (!isDragged) {
    const scroller = el.closest(`.${laneItemsClass}`);
    const clip = scroller?.getBoundingClientRect();

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

class OverlayController {
  private svg: SVGSVGElement;
  private layer: SVGGElement;
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

    this.listen(root, 'pointerover', this.onPointerOver);
    this.listen(root, 'pointerleave', this.onPointerLeave);
    this.listen(root, 'scroll', this.requestDraw, { capture: true, passive: true });
    this.listen(root.win, 'resize', this.requestDraw, { passive: true });
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
    if (this.dragging || e.pointerType === 'touch') return;

    const card = (e.target as Element).closest?.(`.${itemClass}[data-item-id]`) as HTMLElement;
    const key = card && this.hasRelations(card.dataset.itemId) ? card.dataset.itemId : null;

    if (key === this.focusKey) {
      this.clearHoverTimer();
      return;
    }

    this.clearHoverTimer();
    this.hoverTimer = this.root.win.setTimeout(() => {
      this.hoverTimer = null;
      this.setFocus(key);
    }, hoverDelay);
  };

  private onPointerLeave = () => {
    if (this.dragging) return;
    this.clearHoverTimer();
    this.setFocus(null);
  };

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
    const key = this.focusKey;
    if (!key && !this.layer.hasChildNodes()) return;

    this.layer.empty();

    const insights = this.stateManager.relations.getInsights();
    if (!key || !insights) return;

    const focusBlockId = this.findBlockId(key);
    if (!focusBlockId) return;

    const { ids, edges } = insights.index.getConnected(focusBlockId);
    const origin = this.root.getBoundingClientRect();
    const boxes = new Map<string, Box>();

    for (const blockId of ids) {
      const card = insights.byBlockId.get(blockId);
      if (!card || card.archived) continue;

      const isDragged = this.dragging && card.key === key;
      const el = findCard(this.root, card.key, isDragged);
      const box = el && measure(el, origin, isDragged);
      if (box) boxes.set(blockId, box);
    }

    const doc = this.root.doc;

    for (const [blockId, box] of boxes) {
      if (box.offscreen) continue;
      const rect = doc.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(box.left - 2));
      rect.setAttribute('y', String(box.top - 2));
      rect.setAttribute('width', String(box.right - box.left + 4));
      rect.setAttribute('height', String(box.bottom - box.top + 4));
      rect.setAttribute('rx', '6');
      rect.addClass(c('relation-outline'));
      if (blockId === focusBlockId) rect.addClass('is-focus');
      this.layer.appendChild(rect);
    }

    for (const [blocker, blocked] of edges) {
      const from = boxes.get(blocker);
      const to = boxes.get(blocked);
      if (!from || !to) continue;

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

  private findBlockId(key: string) {
    const el = findCard(this.root, key, this.dragging);
    return el?.dataset.blockId || null;
  }

  destroy() {
    this.clearHoverTimer();
    if (this.frame !== null) this.root.win.cancelAnimationFrame(this.frame);
    this.cleanup.forEach((fn) => fn());
    this.svg.remove();
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
