import { keyPrefersFlats, parseKeySignatureMode } from './keySignatureNormalize';

const SHARP_NAMES = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
const FLAT_NAMES = ['C', '_D', 'D', '_E', 'E', 'F', '_G', 'G', '_A', 'A', '_B', 'B'];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Relative-major accidental count by pitch class (positive=sharps, negative=flats). */
const MAJOR_PC_ACCIDENTALS = {
  0: 0,
  1: -5,
  2: 2,
  3: -3,
  4: 4,
  5: -1,
  6: 6,
  7: 1,
  8: -4,
  9: 3,
  10: -2,
  11: 5,
};

const ROOT_TO_PC = {
  Cb: 11, C: 0, 'C#': 1,
  Db: 1, D: 2, 'D#': 3,
  Eb: 3, E: 4, 'E#': 5,
  Fb: 4, F: 5, 'F#': 6,
  Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10,
  Bb: 10, B: 11, 'B#': 0,
};

function parseKeySignature(keyText) {
  const text = String(keyText || '').trim();
  if (!text) return null;
  const match = text.match(/^([A-Ga-g])([#b]?)(m|min|minor|maj|major)?$/);
  if (!match) return null;
  let root = match[1].toUpperCase();
  const accidental = match[2] || '';
  if (accidental === '#') root += '#';
  if (accidental === 'b') root += 'b';
  const modeToken = (match[3] || '').toLowerCase();
  const mode = modeToken === 'm' || modeToken === 'min' || modeToken === 'minor' ? 'minor' : 'major';
  return { root: root, mode: mode, preferFlats: root.includes('b') };
}

function rootToIndex(root) {
  const sharpIndex = SHARP_NAMES.findIndex(function(name) {
    return name.replace('^', '#') === root || name === root;
  });
  if (sharpIndex >= 0) return sharpIndex;
  const flatIndex = FLAT_NAMES.findIndex(function(name) {
    return name.replace('_', 'b') === root || name === root;
  });
  return flatIndex >= 0 ? flatIndex : null;
}

function allowedPitchClasses(keyInfo) {
  if (!keyInfo) return null;
  const rootIndex = rootToIndex(keyInfo.root);
  if (rootIndex == null) return null;
  const scale = keyInfo.mode === 'minor' ? NATURAL_MINOR_SCALE : MAJOR_SCALE;
  return scale.map(function(step) { return (rootIndex + step) % 12; });
}

function nearestScalePitchClass(pitchClass, allowed) {
  if (!allowed || allowed.length === 0) return pitchClass;
  if (allowed.indexOf(pitchClass) >= 0) return pitchClass;
  let best = allowed[0];
  let bestDistance = 12;
  allowed.forEach(function(candidate) {
    const distance = Math.min(
      (candidate - pitchClass + 12) % 12,
      (pitchClass - candidate + 12) % 12
    );
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

function relativeMajorOffset(parsed) {
  if (!parsed) return 0;
  if (parsed.kind === 'minor') return 3;
  if (parsed.kind === 'mode') {
    switch (parsed.canonicalSuffix) {
      case 'dorian': return -2;
      case 'phrygian': return -4;
      case 'lydian': return -5;
      case 'mixolydian': return -7;
      case 'locrian': return 1;
      default: return 0;
    }
  }
  return 0;
}

/**
 * Letter → accidental alteration implied by the key signature (-1 flat, +1 sharp).
 */
export function keySignatureLetterAlterations(keyText) {
  const map = {};
  const parsed = parseKeySignatureMode(keyText);
  if (!parsed || !parsed.root) return map;
  const rootPc = ROOT_TO_PC[parsed.root];
  if (rootPc == null) return map;
  const relativeMajorPc = (rootPc + relativeMajorOffset(parsed) + 12) % 12;
  let count = MAJOR_PC_ACCIDENTALS[relativeMajorPc];
  if (typeof count !== 'number') return map;
  // F#/Gb tie: follow root spelling.
  if (count === 6 && parsed.root.indexOf('b') >= 0) count = -6;
  if (count > 0) {
    for (let i = 0; i < count; i += 1) map[SHARP_ORDER[i]] = 1;
  } else if (count < 0) {
    for (let i = 0; i < -count; i += 1) map[FLAT_ORDER[i]] = -1;
  }
  return map;
}

function applyOctave(letterWithAccidental, octave) {
  if (octave >= 5) {
    return letterWithAccidental.toLowerCase() + "'".repeat(octave - 5);
  }
  if (octave === 4) return letterWithAccidental;
  return letterWithAccidental + ','.repeat(Math.max(0, 4 - octave));
}

/**
 * Drop accidentals already in the key signature; write naturals when cancelling.
 * Input is a chromatic spelling like "^F" / "_B" / "C" (no octave marks).
 */
export function spellAbcPitchInKey(chromaticName, keyText) {
  const raw = String(chromaticName || '');
  if (!raw) return raw;
  const alterations = keySignatureLetterAlterations(keyText);
  if (!Object.keys(alterations).length && !String(keyText || '').trim()) {
    return raw;
  }

  let i = 0;
  let written = 0;
  if (raw.indexOf('^^') === 0) { written = 2; i = 2; }
  else if (raw.indexOf('__') === 0) { written = -2; i = 2; }
  else if (raw.charAt(0) === '^') { written = 1; i = 1; }
  else if (raw.charAt(0) === '_') { written = -1; i = 1; }
  else if (raw.charAt(0) === '=') { written = 0; i = 1; }

  const letter = raw.charAt(i);
  if (!letter) return raw;
  const rest = raw.slice(i + 1);
  const letterUpper = letter.toUpperCase();
  const keyAcc = alterations[letterUpper] || 0;

  if (written === keyAcc) {
    return letter + rest;
  }
  if (written === 0 && keyAcc !== 0) {
    return '=' + letter + rest;
  }
  const prefix = written === 2 ? '^^'
    : written === -2 ? '__'
      : written === 1 ? '^'
        : written === -1 ? '_'
          : written === 0 ? '='
            : '';
  return prefix + letter + rest;
}

export function midiToAbcPitch(midi, options) {
  const opts = options || {};
  let value = Math.round(Number(midi) || 0);
  const pitchClass = ((value % 12) + 12) % 12;
  const octave = Math.floor(value / 12) - 1;
  const keyInfo = parseKeySignature(opts.key);
  const allowed = allowedPitchClasses(keyInfo);
  let resolvedPitchClass = pitchClass;

  if (opts.snapToScale && allowed) {
    const confidence = typeof opts.confidence === 'number' ? opts.confidence : 1;
    if (confidence < (opts.snapConfidenceThreshold || 0.45)) {
      resolvedPitchClass = nearestScalePitchClass(pitchClass, allowed);
      value = (octave + 1) * 12 + resolvedPitchClass;
    }
  }

  const preferFlats = opts.preferFlats != null
    ? !!opts.preferFlats
    : (opts.key ? keyPrefersFlats(opts.key) : !!(keyInfo && keyInfo.preferFlats));
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  const chromatic = names[resolvedPitchClass];
  const spelled = opts.omitKeyAccidentals === false
    ? chromatic
    : spellAbcPitchInKey(chromatic, opts.key);
  return applyOctave(spelled, octave);
}

/** Alternate enharmonic ABC name for a MIDI pitch, or null if no useful alternate. */
export function enharmonicAbcName(midi, preferFlats) {
  const value = Math.round(Number(midi) || 0);
  const pitchClass = ((value % 12) + 12) % 12;
  const sharp = SHARP_NAMES[pitchClass];
  const flat = FLAT_NAMES[pitchClass];
  if (sharp === flat) return null;
  const chosen = preferFlats ? flat : sharp;
  const octave = Math.floor(value / 12) - 1;
  return applyOctave(chosen, octave);
}

export function formatKeySignatureShort(keyText) {
  const parsed = parseKeySignature(keyText);
  if (parsed) {
    return parsed.mode === 'minor' ? parsed.root + 'm' : parsed.root;
  }
  const match = String(keyText || '').trim().match(/^([A-Ga-g])([#b]?)\s*(major|minor|maj|min|m)?$/i);
  if (!match) return String(keyText || '').trim();
  let root = match[1].toUpperCase();
  const accidental = match[2] || '';
  if (accidental === '#') root += '#';
  if (accidental === 'b') root += 'b';
  const modeToken = (match[3] || '').toLowerCase();
  const mode = modeToken === 'm' || modeToken === 'min' || modeToken === 'minor' ? 'minor' : 'major';
  return mode === 'minor' ? root + 'm' : root;
}

export function parseKeySignatureForTests(keyText) {
  return parseKeySignature(keyText);
}
