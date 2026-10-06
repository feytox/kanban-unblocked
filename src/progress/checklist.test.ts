import { describe, expect, it } from 'vitest';

import { getChecklistProgress, parseChecklist, toggleProgressMarker } from './checklist';

const note = `---
tags: [a]
---
- [x] top done
- [ ] top todo

## Plan %% kanban:progress %%
- [x] one
- [ ] two
  - [X] nested
### Details
1. [ ] ordered
> - [x] quoted

\`\`\`md
- [ ] in code
\`\`\`

## Notes
- [ ] other
- [-] cancelled
* [/] in progress
`;

describe('checklist progress', () => {
  const parsed = parseChecklist(note);

  it('counts a marked section with its subsections', () => {
    expect(getChecklistProgress(parsed, { wholeNote: true })).toEqual({
      done: 3,
      total: 5,
      heading: 'Plan',
    });
  });

  it('prefers the heading from the link', () => {
    expect(getChecklistProgress(parsed, { heading: 'Notes', wholeNote: true })).toEqual({
      done: 1,
      total: 2,
      heading: 'Notes',
    });
    expect(getChecklistProgress(parsed, { heading: 'Plan#Details', wholeNote: true })).toEqual({
      done: 1,
      total: 2,
      heading: 'Details',
    });
  });

  it('falls back to markers when the linked heading is missing or a block', () => {
    expect(getChecklistProgress(parsed, { heading: 'Nope', wholeNote: true })?.heading).toBe(
      'Plan'
    );
    expect(getChecklistProgress(parsed, { heading: '^abc', wholeNote: true })?.heading).toBe(
      'Plan'
    );
  });

  it('counts the whole note only when allowed', () => {
    const plain = parseChecklist('# A\n- [x] a\n- [ ] b\n```\n- [ ] c\n```\n- [-] d');
    expect(getChecklistProgress(plain, { wholeNote: true })).toEqual({ done: 1, total: 2 });
    expect(getChecklistProgress(plain, { wholeNote: false })).toBeNull();
  });

  it('combines several marked sections', () => {
    const md =
      '## A %%kanban:progress%%\n- [x] a\n## B\n- [ ] b\n## C %% kanban:progress %%\n- [ ] c';
    expect(getChecklistProgress(parseChecklist(md), { wholeNote: true })).toEqual({
      done: 1,
      total: 2,
    });
  });

  it('toggles the marker on headings only', () => {
    expect(toggleProgressMarker('## Plan')).toBe('## Plan %% kanban:progress %%');
    expect(toggleProgressMarker('## Plan %% kanban:progress %%')).toBe('## Plan');
    expect(toggleProgressMarker('- [ ] task')).toBeNull();
    expect(toggleProgressMarker('#tag')).toBeNull();
  });
});
