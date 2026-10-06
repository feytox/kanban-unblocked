import { describe, expect, it } from 'vitest';

import { splitCardText, toPlainText } from './cardText';

describe('card text', () => {
  const triggers = { date: '@', time: '@@', unlock: '@>' };

  it('separates text from metadata', () => {
    expect(
      splitCardText(
        'Fix **login** bug #work @{2026-10-10} @@{12:00} @>{2026-10-08} [prio:: high] 📅 2026-10-10',
        triggers
      )
    ).toEqual({
      text: 'Fix login bug',
      metadata: [
        '#work',
        '@{2026-10-10}',
        '@@{12:00}',
        '@>{2026-10-08}',
        '[prio:: high]',
        '📅 2026-10-10',
      ],
    });
  });

  it('keeps metadata order and handles date links', () => {
    expect(splitCardText('#a Write [[Docs|docs]] @[[2026-10-10]] #b', triggers)).toEqual({
      text: 'Write docs',
      metadata: ['#a', '@[[2026-10-10]]', '#b'],
    });
  });

  it('respects custom triggers', () => {
    expect(
      splitCardText('Call mom !{2026-10-10}', { date: '!', time: '!!', unlock: '!>' })
    ).toEqual({
      text: 'Call mom',
      metadata: ['!{2026-10-10}'],
    });
  });

  it('does not treat issue numbers or headings in words as tags', () => {
    expect(splitCardText('Close PR#12', triggers).text).toBe('Close PR#12');
  });

  it('flattens markup', () => {
    expect(toPlainText('[[Note#Head]] and [site](http://x.y) `code` _it_ ~~old~~')).toBe(
      'Note Head and site code it old'
    );
  });
});
