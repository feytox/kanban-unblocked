/**
 * Splits the first line of a card into its plain text and the metadata around it (tags, dates,
 * times, hide-until, inline fields, Tasks emoji fields). Pure, so it can be unit-tested.
 */

export interface CardTextTriggers {
  date: string;
  time: string;
  unlock: string;
}

export interface CardTextParts {
  /** Readable text: no metadata, links reduced to their text, no markup. */
  text: string;
  /** Metadata tokens in their original order. */
  metadata: string[];
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const tagRegEx = /(?<=^|\s)#[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]+/g;
const inlineFieldRegEx = /\[[^[\]:]+::[^\]]*\]|\([^():]+::[^)]*\)/g;
const taskEmojiRegEx =
  /[🔺⏫🔼🔽⏬]\uFE0F?|(?:🛫|➕|⏳|⌛|📅|📆|🗓|✅|❌)\uFE0F? *\d{4}-\d{2}-\d{2}|⛔\uFE0F? *[a-zA-Z0-9-_,]+|🆔 *[a-zA-Z0-9-_]+|🔁 *[a-zA-Z0-9; !]+/gu;

function metadataPatterns(triggers: CardTextTriggers): RegExp[] {
  // Longer triggers first, so `@@{` isn't read as `@` + `@{`.
  const wrapped = [triggers.unlock, triggers.time, triggers.date]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((trigger) => {
      const t = escapeRegExp(trigger);
      return new RegExp(`${t}\\{[^}]*\\}|${t}\\[\\[[^\\]]*\\]\\]`, 'g');
    });

  return [...wrapped, inlineFieldRegEx, taskEmojiRegEx, tagRegEx];
}

export function toPlainText(str: string) {
  return str
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, (_, alias, target) =>
      alias ? target : target.replace(/#\^?/g, ' ')
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==|`)/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitCardText(line: string, triggers: CardTextTriggers): CardTextParts {
  const ranges: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) => ranges.some(([s, e]) => start < e && end > s);

  for (const pattern of metadataPatterns(triggers)) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!match[0] || overlaps(start, end)) continue;
      ranges.push([start, end]);
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);

  let text = '';
  let pos = 0;
  for (const [start, end] of ranges) {
    text += line.slice(pos, start) + ' ';
    pos = end;
  }
  text += line.slice(pos);

  return {
    text: toPlainText(text),
    metadata: ranges.map(([start, end]) => line.slice(start, end)),
  };
}

/** Characters Obsidian doesn't allow in file names. */
export function sanitizeFileName(str: string) {
  return str
    .replace(/[\\/:"*?<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
