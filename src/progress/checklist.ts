/**
 * Checkbox progress of a linked note. Pure: the note is parsed once per version, then any section
 * can be queried cheaply.
 */

/** Put this in a heading to count only the checkboxes under it. */
export const progressMarker = '%% kanban:progress %%';

const markerRegEx = /%%\s*kanban:progress\s*%%/i;
const commentRegEx = /%%.*?%%/g;
const headingRegEx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const closingHashesRegEx = /(?:^|[ \t]+)#+$/;
const fenceRegEx = /^ {0,3}(`{3,}|~{3,})/;
const taskRegEx = /^[ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[(.)\]/;

// Tasks plugin's "cancelled" status: no longer has to be done, so it doesn't count at all.
const cancelledChar = '-';

export interface ChecklistHeading {
  /** Heading text without comments, as Obsidian links to it. */
  text: string;
  level: number;
  line: number;
  marked: boolean;
}

export interface ChecklistTask {
  line: number;
  done: boolean;
}

export interface ParsedChecklist {
  headings: ChecklistHeading[];
  tasks: ChecklistTask[];
  lineCount: number;
}

export interface ChecklistProgress {
  done: number;
  total: number;
  /** The heading the count is limited to, if exactly one. */
  heading?: string;
}

export interface ChecklistQuery {
  /** Heading from the link itself (`[[Note#Heading]]`); takes priority over markers. */
  heading?: string;
  /** Count the whole note when no section is given or marked. */
  wholeNote: boolean;
}

export function parseChecklist(md: string): ParsedChecklist {
  const lines = md.split(/\r?\n/);
  const headings: ChecklistHeading[] = [];
  const tasks: ChecklistTask[] = [];

  let i = 0;

  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) i = end + 1;
  }

  let fence: string | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(fenceRegEx);

    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }

    const heading = line.match(headingRegEx);
    if (heading) {
      const raw = (heading[2] ?? '').replace(closingHashesRegEx, '');
      headings.push({
        text: raw.replace(commentRegEx, '').trim(),
        level: heading[1].length,
        line: i,
        marked: markerRegEx.test(raw),
      });
      continue;
    }

    const task = line.match(taskRegEx);
    if (task && task[1] !== cancelledChar) {
      tasks.push({ line: i, done: task[1] !== ' ' });
    }
  }

  return { headings, tasks, lineCount: lines.length };
}

/** Obsidian drops or replaces some characters when linking to a heading, so compare loosely. */
export function normalizeHeading(heading: string) {
  return heading
    .replace(/[#|^:%[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

/** Line range covered by a heading: up to the next heading of the same or a higher level. */
function sectionRange(parsed: ParsedChecklist, index: number): [number, number] {
  const heading = parsed.headings[index];
  for (let i = index + 1; i < parsed.headings.length; i++) {
    if (parsed.headings[i].level <= heading.level) return [heading.line, parsed.headings[i].line];
  }
  return [heading.line, parsed.lineCount];
}

function findLinkedHeading(parsed: ParsedChecklist, subpath: string) {
  // `#Parent#Child` links to the last heading of the chain.
  const target = normalizeHeading(subpath.split('#').filter(Boolean).pop() ?? '');
  if (!target) return -1;
  return parsed.headings.findIndex((h) => normalizeHeading(h.text) === target);
}

/** Returns null when nothing should be counted. */
export function getChecklistProgress(
  parsed: ParsedChecklist,
  query: ChecklistQuery
): ChecklistProgress | null {
  let indexes: number[] = [];

  if (query.heading && !query.heading.startsWith('^')) {
    const linked = findLinkedHeading(parsed, query.heading);
    if (linked >= 0) indexes = [linked];
  }

  if (!indexes.length) {
    parsed.headings.forEach((h, i) => {
      if (h.marked) indexes.push(i);
    });
  }

  if (!indexes.length) {
    if (!query.wholeNote) return null;
    return count(parsed.tasks);
  }

  const ranges = indexes.map((i) => sectionRange(parsed, i));
  const tasks = parsed.tasks.filter((task) =>
    ranges.some(([start, end]) => task.line > start && task.line < end)
  );

  const progress = count(tasks);
  if (indexes.length === 1) progress.heading = parsed.headings[indexes[0]].text;
  return progress;
}

function count(tasks: ChecklistTask[]): ChecklistProgress {
  let done = 0;
  for (const task of tasks) if (task.done) done++;
  return { done, total: tasks.length };
}

/** Adds the marker to a heading line, or removes it. Returns null for a non-heading line. */
export function toggleProgressMarker(line: string): string | null {
  if (!headingRegEx.test(line)) return null;
  if (markerRegEx.test(line)) {
    return line.replace(/[ \t]*%%\s*kanban:progress\s*%%/i, '').replace(/[ \t]+$/, '');
  }
  return `${line.replace(/[ \t]+$/, '')} ${progressMarker}`;
}
