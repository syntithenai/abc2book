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

export function assembleHarmonyVoiceAbc(melodyAbc, harmonyBody, harmonyVoiceName) {
  if (!harmonyBody || !String(harmonyBody).trim()) {
    return melodyAbc;
  }
  const split = splitAbcHeadersAndBody(melodyAbc);
  const voiceName = harmonyVoiceName || 'Chords';
  const headers = split.headers.filter(function(line) {
    return !/^V:\d/.test(line.trim());
  });
  headers.push('V:1');
  headers.push('V:2 nm="' + voiceName.replace(/"/g, '') + '"');
  return headers.join('\n')
    + '\n[V:1]\n'
    + split.body
    + '\n[V:2]\n'
    + String(harmonyBody).trim();
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

export function finalizeMidiImportAbc(abc, importResult, abcjsParser) {
  let merged = abc || '';
  const profile = (importResult && importResult.profile) || {};
  const tuneMeta = {
    meter: profile.time_signature || profile.meter || '4/4',
    noteLength: '1/8',
    tempo: profile.tempo_bpm || 120,
  };
  if (importResult && importResult.chordSegments) {
    merged = mergeMidiChordSegmentsIntoAbc(
      merged,
      importResult.chordSegments,
      abcjsParser,
      tuneMeta
    );
  }
  if (importResult && importResult.harmonyAbc) {
    merged = assembleHarmonyVoiceAbc(
      merged,
      importResult.harmonyAbc,
      importResult.harmonyVoiceName
    );
  }
  return merged;
}
