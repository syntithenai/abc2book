import { buildTimedChordsFromDetection } from './timedChordsModel';
import { deriveChordSymbols } from './timedAbcDeriver';

function splitAbcHeadersAndBody(abc) {
  const lines = String(abc || '').split('\n');
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Z]:/.test(line) || line.startsWith('%') || line.startsWith('V:')) {
      headerEnd = i + 1;
      continue;
    }
    if (line.trim()) {
      break;
    }
  }
  const headers = lines.slice(0, headerEnd).filter(function(line) {
    return !/^\[V:\d+\]/.test(line.trim());
  });
  const bodyLines = lines.slice(headerEnd).filter(function(line) {
    return !line.startsWith('V:') && !/^\[V:\d+\]/.test(line.trim());
  });
  return {
    headers: headers,
    body: bodyLines.join('\n').trim(),
  };
}

export function appendHarmonyVoiceAbc(abc, harmonyBody, harmonyVoiceName) {
  const text = String(abc || '').trim();
  const body = String(harmonyBody || '').trim();
  if (!body || !text) return text;

  const hasVoiceSection = /^\[V:\d+\]/m.test(text) || /^V:\d+/m.test(text);
  if (!hasVoiceSection) {
    const split = splitAbcHeadersAndBody(text);
    const name = (harmonyVoiceName || 'Chords').replace(/"/g, '');
    return split.headers.join('\n')
      + '\nV:2 nm="' + name + '" clef=treble'
      + '\n[V:1]\n' + split.body
      + '\n[V:2]\n' + body;
  }

  let maxVoice = 0;
  text.split('\n').forEach(function(line) {
    const match = line.trim().match(/^V:(\d+)/);
    if (match) maxVoice = Math.max(maxVoice, parseInt(match[1], 10));
  });
  const newId = maxVoice + 1;
  const name = (harmonyVoiceName || 'Chords').replace(/"/g, '');
  const lines = text.split('\n');
  let insertAt = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\[V:\d+\]/.test(lines[i].trim())) {
      insertAt = i;
      break;
    }
  }
  lines.splice(insertAt, 0, 'V:' + newId + ' nm="' + name + '" clef=treble');
  return lines.join('\n') + '\n[V:' + newId + ']\n' + body;
}

export function assembleHarmonyVoiceAbc(melodyAbc, harmonyBody, harmonyVoiceName) {
  return appendHarmonyVoiceAbc(melodyAbc, harmonyBody, harmonyVoiceName);
}

export function mergeMidiChordSegmentsIntoAbc(abc, chordSegments, abcjsParser, tuneMeta) {
  if (!abc || !chordSegments || !abcjsParser || typeof abcjsParser.mergeChords !== 'function') {
    return abc;
  }
  const segments = chordSegments.segments || [];
  if (!segments.length) {
    return abc;
  }
  const timed = buildTimedChordsFromDetection(chordSegments, tuneMeta || {}, { kind: 'midi' });
  const meter = (tuneMeta && tuneMeta.meter) || chordSegments.meter || '4/4';
  const beatsPerBar = parseInt(String(meter).split('/')[0], 10) || 4;
  const chordGrid = deriveChordSymbols(timed, {
    beatsPerBar: beatsPerBar,
    slotsPerBeat: 2,
  });
  if (!chordGrid || !chordGrid.trim()) {
    return abc;
  }
  return abcjsParser.mergeChords(chordGrid, abc);
}

export function finalizeMidiImportAbc(abc, importResult, abcjsParser, options) {
  const opts = options || {};
  let merged = abc || '';
  const profile = (importResult && importResult.profile) || {};
  const trackCount = Array.isArray(opts.trackIds) ? opts.trackIds.length : 0;
  const multiVoice = (importResult && importResult.mode === 'multi_voice') || trackCount > 1;
  const allowChords = opts.includeChords === true && !(multiVoice && trackCount > 2);
  const tuneMeta = {
    meter: profile.time_signature || profile.meter || '4/4',
    noteLength: '1/8',
    tempo: profile.tempo_bpm || 120,
  };
  if (allowChords && importResult && importResult.chordSegments) {
    merged = mergeMidiChordSegmentsIntoAbc(
      merged,
      importResult.chordSegments,
      abcjsParser,
      tuneMeta
    );
  }
  if (allowChords && importResult && importResult.harmonyAbc) {
    merged = assembleHarmonyVoiceAbc(
      merged,
      importResult.harmonyAbc,
      importResult.harmonyVoiceName
    );
  }
  return merged;
}
