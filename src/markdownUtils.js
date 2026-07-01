// Lightweight markdown parser for the tune background info field.
// Supports the subset produced by the research LLM: ATX headings, bold,
// italic, inline links, bare URLs, and ordered/unordered lists. Returns a
// plain data structure so it can be unit tested independently of React.

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const STRONG_RE = /\*\*([^*]+?)\*\*|__([^_]+?)__/;
const EM_RE = /\*([^*\n]+?)\*|_([^_\n]+?)_/;
const AUTOLINK_RE = /(https?:\/\/[^\s<>()[\]]+)/;

function earliestMatch(text) {
  const candidates = [
    { type: 'link', match: LINK_RE.exec(text) },
    { type: 'strong', match: STRONG_RE.exec(text) },
    { type: 'em', match: EM_RE.exec(text) },
    { type: 'autolink', match: AUTOLINK_RE.exec(text) },
  ].filter(function(c) { return c.match; });
  if (candidates.length === 0) return null;
  candidates.sort(function(a, b) { return a.match.index - b.match.index; });
  return candidates[0];
}

export function parseInline(text) {
  const nodes = [];
  let remaining = String(text || '');

  while (remaining.length > 0) {
    const found = earliestMatch(remaining);
    if (!found) {
      nodes.push({ type: 'text', value: remaining });
      break;
    }
    const idx = found.match.index;
    if (idx > 0) {
      nodes.push({ type: 'text', value: remaining.slice(0, idx) });
    }

    const m = found.match;
    if (found.type === 'link') {
      nodes.push({ type: 'link', href: m[2], children: parseInline(m[1]) });
    } else if (found.type === 'strong') {
      nodes.push({ type: 'strong', children: parseInline(m[1] || m[2] || '') });
    } else if (found.type === 'em') {
      nodes.push({ type: 'em', children: parseInline(m[1] || m[2] || '') });
    } else if (found.type === 'autolink') {
      nodes.push({ type: 'link', href: m[1], children: [{ type: 'text', value: m[1] }] });
    }

    remaining = remaining.slice(idx + m[0].length);
  }

  return nodes;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdownBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraph.map(parseInline) });
      paragraph = [];
    }
  }

  function flushList() {
    if (list) {
      blocks.push(list);
      list = null;
    }
  }

  lines.forEach(function(rawLine) {
    const line = rawLine.replace(/\s+$/, '');

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      return;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        children: parseInline(headingMatch[2]),
      });
      return;
    }

    const olMatch = OL_RE.exec(line);
    if (olMatch) {
      flushParagraph();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(parseInline(olMatch[1]));
      return;
    }

    const ulMatch = UL_RE.exec(line);
    if (ulMatch) {
      flushParagraph();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(parseInline(ulMatch[1]));
      return;
    }

    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return blocks;
}
