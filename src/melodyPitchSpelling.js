const SHARP_NAMES = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
const FLAT_NAMES = ['C', '_D', 'D', '_E', 'E', 'F', '_G', 'G', '_A', 'A', '_B', 'B'];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

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

  const names = keyInfo && keyInfo.preferFlats ? FLAT_NAMES : SHARP_NAMES;
  const name = names[resolvedPitchClass];

  if (octave >= 5) {
    return name.toLowerCase() + "'".repeat(octave - 5);
  }
  if (octave === 4) {
    return name;
  }
  return name + ','.repeat(Math.max(0, 4 - octave));
}

export function parseKeySignatureForTests(keyText) {
  return parseKeySignature(keyText);
}
