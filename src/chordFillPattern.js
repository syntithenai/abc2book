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
  const beatsPerBar = Math.max(
    1,
    opts.beatsPerBar > 0 ? opts.beatsPerBar : beatsPerBarFromMeter(meter)
  );
  const meterDenominator = parseInt(String(meter).split('/')[1], 10) || 4;
  // Match unit length to metronome beat so one token == one metronome beat.
  const defaultNoteLength = meterDenominator === 8 && !(opts.beatsPerBar > 0)
    ? '1/8'
    : '1/4';

  const chordInfo = parseChord(String(chordLabel || '').trim());
  if (!chordInfo || chordInfo.error || !chordInfo.normalized.notes.length) {
    return null;
  }

  const chordToken = chordNotesToAbcChord(chordInfo.normalized.notes);
  if (!chordToken) return null;

  const fillBeats = getFillBeatIndices(beatsPerBar);
  const beatTokens = [];
  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    // One beat of unit length each so the fill is exactly one metronome bar.
    if (fillBeats.indexOf(beat) !== -1) {
      beatTokens.push(chordToken);
    } else {
      beatTokens.push('z');
    }
  }

  // Emit an M: that has numerator == metronome beats so abcjs bar length matches.
  const fillMeter = String(beatsPerBar) + '/' + (defaultNoteLength === '1/8' ? '8' : '4');

  return [
    'X:1',
    'M:' + fillMeter,
    'L:' + defaultNoteLength,
    'Q:1/4=' + tempo,
    'K:' + key,
    beatTokens.join(' ') + ' |',
  ].join('\n');
}

export function chordFillCacheKey(chordLabel, options) {
  const opts = options || {};
  const beatsPerBar = opts.beatsPerBar > 0
    ? opts.beatsPerBar
    : beatsPerBarFromMeter(opts.meter || '4/4');
  return [
    String(chordLabel || '').trim(),
    opts.meter || '4/4',
    beatsPerBar,
    opts.tempo > 0 ? opts.tempo : 120,
    opts.key || 'C',
    opts.patternId || 'block',
  ].join('|');
}

/** Exact wall-clock length of one metronome bar. */
export function metronomeBarDurationSec(tempo, beatsPerBar) {
  const bpm = tempo > 0 ? tempo : 120;
  const beats = Math.max(1, beatsPerBar || 4);
  return (60 / bpm) * beats;
}

/**
 * Trim or pad a buffer so its duration matches the metronome bar exactly.
 * Prevents loop drift from abcjs fade tails or sample rounding.
 */
export function trimOrPadBufferToDuration(buffer, durationSec, audioContext) {
  if (!buffer || !(durationSec > 0) || !audioContext) return buffer;
  const frames = Math.max(1, Math.round(durationSec * buffer.sampleRate));
  if (buffer.length === frames) return buffer;
  const out = audioContext.createBuffer(
    buffer.numberOfChannels,
    frames,
    buffer.sampleRate
  );
  const copyFrames = Math.min(buffer.length, frames);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(0, copyFrames));
  }
  return out;
}
