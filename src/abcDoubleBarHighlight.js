import { melodyLineHasMidBlockDoubleBarlines } from './melodyBarlineNormalize';

/**
 * Split ABC note text into plain / double-bar segments for editor highlighting.
 * Mid-block every-bar || lines use a stronger mark class.
 * @returns {{ type: 'text'|'doubleBar'|'midBlockDoubleBar', text: string }[]}
 */
export function buildAbcDoubleBarHighlightParts(text) {
  const raw = String(text == null ? '' : text);
  if (!raw) return [{ type: 'text', text: '' }];

  const parts = [];
  const lines = raw.split('\n');
  lines.forEach(function(line, lineIndex) {
    if (lineIndex > 0) parts.push({ type: 'text', text: '\n' });
    const midBlock = melodyLineHasMidBlockDoubleBarlines(line);
    let last = 0;
    const re = /\|\|/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      if (match.index > last) {
        parts.push({ type: 'text', text: line.slice(last, match.index) });
      }
      parts.push({
        type: midBlock ? 'midBlockDoubleBar' : 'doubleBar',
        text: '||',
      });
      last = match.index + 2;
    }
    if (last < line.length) {
      parts.push({ type: 'text', text: line.slice(last) });
    } else if (line.length === 0 && parts.length === 0) {
      parts.push({ type: 'text', text: '' });
    }
  });
  if (parts.length === 0) parts.push({ type: 'text', text: '' });
  return parts;
}
