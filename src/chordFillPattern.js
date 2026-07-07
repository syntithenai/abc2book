import { chordParserFactory } from 'chord-symbol';

const parseChord = chordParserFactory();

export function beatsPerBarFromMeter(meter) {
  const parts = String(meter || '4/4').split('/');
  return Math.max(1, parseInt(parts[0], 10) || 4);
}

export function noteNameToAbc(noteName) {
  const raw = String(noteName || '').trim();
  if (!raw) return '';
  const step = raw[0].toUpperCase();
  const tail = raw.slice(1);
  let acc = '';
  if (tail.startsWith('#') || tail.startsWith('♯')) acc = '^';
  else if (tail.startsWith('b') || tail.startsWith('♭')) acc = '_';
  return acc + step;
}

export function chordNotesToAbcChord(notes) {
  const tokens = (notes || [])
    .map(noteNameToAbc)
    .filter(Boolean)
    .sort(function(a, b) { return a.localeCompare(b); });
  if (!tokens.length) return '';
  return '[' + tokens.join('') + ']';
}

export function getFillBeatIndices(beatsPerBar) {
  const beats = Math.max(1, beatsPerBar);
  if (beats <= 1) return [0];
  if (beats === 2) return [0, 1];
  if (beats === 3) return [0, 1];
  if (beats === 4) return [0, 2];
  if (beats % 2 === 0) return [0, Math.floor(beats / 2)];
  return [0];
}

export function buildChordFillAbc(chordLabel, options) {
  const opts = options || {};
  const meter = opts.meter || '4/4';
  const tempo = opts.tempo > 0 ? opts.tempo : 120;
  const key = opts.key || 'C';
  const beatsPerBar = beatsPerBarFromMeter(meter);
  const meterDenominator = parseInt(String(meter).split('/')[1], 10) || 4;
  const defaultNoteLength = meterDenominator === 8 ? '1/8' : '1/4';

  const chordInfo = parseChord(String(chordLabel || '').trim());
  if (!chordInfo || chordInfo.error || !chordInfo.normalized.notes.length) {
    return null;
  }

  const chordToken = chordNotesToAbcChord(chordInfo.normalized.notes);
  if (!chordToken) return null;

  const fillBeats = getFillBeatIndices(beatsPerBar);
  const beatTokens = [];
  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    if (fillBeats.indexOf(beat) !== -1) {
      beatTokens.push(chordToken + '2');
    } else {
      beatTokens.push('z2');
    }
  }

  return [
    'X:1',
    'M:' + meter,
    'L:' + defaultNoteLength,
    'Q:1/4=' + tempo,
    'K:' + key,
    beatTokens.join(' ') + ' |',
  ].join('\n');
}

export function chordFillCacheKey(chordLabel, options) {
  const opts = options || {};
  return [
    String(chordLabel || '').trim(),
    opts.meter || '4/4',
    opts.tempo > 0 ? opts.tempo : 120,
    opts.key || 'C',
    opts.patternId || 'block',
  ].join('|');
}
