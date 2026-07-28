import { meterTextFromAbcMeterElement } from '../metronomeRhythmPresets';

const ZERO_DURATION = { num: 0, den: 1, dotted: false };

export function zeroDurationFields() {
  return {
    duration: ZERO_DURATION,
    tieStart: false,
    tieEnd: false,
  };
}

/** Extract inner key text from [K:…] using abcjs char positions when available. */
export function keyTextFromAbcjsSymbol(symbol, abcSource) {
  if (!symbol) return '';
  if (abcSource && symbol.startChar != null && symbol.endChar != null) {
    const raw = String(abcSource).slice(symbol.startChar, symbol.endChar);
    const match = raw.match(/^\[K:(.+)\]$/);
    if (match) return match[1];
  }
  const root = symbol.root || 'C';
  const acc = symbol.acc || '';
  const mode = symbol.mode || '';
  if (mode === 'm') return root + acc + 'm';
  if (mode) return root + acc + mode;
  return root + acc;
}

/** Extract inner meter text from [M:…] using abcjs char positions when available. */
export function meterTextFromAbcjsSymbol(symbol, abcSource) {
  if (!symbol) return '';
  if (abcSource && symbol.startChar != null && symbol.endChar != null) {
    const raw = String(abcSource).slice(symbol.startChar, symbol.endChar);
    const match = raw.match(/^\[M:(.+)\]$/);
    if (match) return match[1];
  }
  return meterTextFromAbcMeterElement(symbol);
}

export function isLayoutEventType(type) {
  return type === 'barline'
    || type === 'lineBreak'
    || type === 'keyChange'
    || type === 'meterChange';
}
