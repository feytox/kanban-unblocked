import { App, TAbstractFile, TFile } from 'obsidian';
import { useEffect, useRef, useState } from 'preact/compat';

import { ParsedChecklist, parseChecklist } from './checklist';

/**
 * Parsed checklists of linked notes, shared by all boards. Notes are read asynchronously and parsed
 * once per version, so rendering a card never waits on the disk. Cards subscribe to their note's
 * path and re-render only when that note changes.
 */
export class ChecklistStore {
  private cache = new Map<string, ParsedChecklist>();
  private loading = new Set<string>();
  private listeners = new Map<string, Set<() => void>>();

  constructor(private app: App) {}

  /** Returns undefined until the note has been read; subscribers are notified once it is. */
  get(file: TFile): ParsedChecklist | undefined {
    const cached = this.cache.get(file.path);
    if (cached) return cached;

    this.load(file);
    return undefined;
  }

  peek(path: string) {
    return this.cache.get(path);
  }

  subscribe(path: string, fn: () => void) {
    let set = this.listeners.get(path);
    if (!set) this.listeners.set(path, (set = new Set()));
    set.add(fn);

    return () => {
      set.delete(fn);
      if (!set.size) this.listeners.delete(path);
    };
  }

  /** Call with the new contents whenever a note changes. */
  onChanged(file: TFile, data: string) {
    if (!this.cache.has(file.path) && !this.listeners.has(file.path)) return;

    if (this.listeners.has(file.path)) {
      this.cache.set(file.path, parseChecklist(data));
      this.notify(file.path);
    } else {
      // Nobody shows this note any more; read it again if it comes back.
      this.cache.delete(file.path);
    }
  }

  onRemoved(file: TAbstractFile, path = file.path) {
    if (!this.cache.delete(path)) return;
    this.notify(path);
  }

  destroy() {
    this.cache.clear();
    this.listeners.clear();
  }

  private async load(file: TFile) {
    const { path } = file;
    if (this.loading.has(path)) return;
    this.loading.add(path);

    try {
      const data = await this.app.vault.cachedRead(file);
      this.cache.set(path, parseChecklist(data));
      this.notify(path);
    } catch (e) {
      console.error('Kanban: could not read', path, e);
    } finally {
      this.loading.delete(path);
    }
  }

  private notify(path: string) {
    this.listeners.get(path)?.forEach((fn) => fn());
  }
}

/** The parsed checklist of a note, re-rendering when the note changes. */
export function useChecklist(store: ChecklistStore, file: TFile | null | undefined) {
  const [, setVersion] = useState(0);
  const rendered = useRef<ParsedChecklist | undefined>();
  const path = file?.path;

  useEffect(() => {
    if (!path) return;
    const rerender = () => setVersion((v) => v + 1);
    const unsubscribe = store.subscribe(path, rerender);
    // The read may have finished between render and subscribing.
    if (store.peek(path) !== rendered.current) rerender();
    return unsubscribe;
  }, [store, path]);

  rendered.current = file ? store.get(file) : undefined;
  return rendered.current;
}
