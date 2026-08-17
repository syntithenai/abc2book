/** Roots used for major/minor and mode option generation (ABC key table). */
const ROOTS = [
  'Cb', 'C', 'C#',
  'Db', 'D', 'D#',
  'Eb', 'E', 'E#',
  'Fb', 'F', 'F#',
  'Gb', 'G', 'G#',
  'Ab', 'A', 'A#',
  'Bb', 'B', 'B#',
];

/** @type {{ kind: 'major'|'minor'|'mode', canonical: string, aliases: string[] }[]} */
const MODE_DEFS = [
  { kind: 'major', canonical: '', aliases: ['', 'maj', 'major', 'ion', 'ionian'] },
  {
    kind: 'minor',
    canonical: 'm',
    aliases: [
      'm', 'min', 'minor',
      'aeo', 'aeolian',
      'nat', 'natural', 'naturalminor',
      'harm', 'harmonic', 'harmonicminor',
      'mel', 'melodic', 'melodicminor',
    ],
  },
  {
    kind: 'mode',
    canonical: 'mixolydian',
    aliases: ['mix', 'mixolydian', 'myxolydian', 'myxolidian', 'mixolidian'],
  },
  { kind: 'mode', canonical: 'dorian', aliases: ['dor', 'dorian'] },
  { kind: 'mode', canonical: 'phrygian', aliases: ['phr', 'phrygian'] },
  { kind: 'mode', canonical: 'lydian', aliases: ['lyd', 'lydian'] },
  { kind: 'mode', canonical: 'locrian', aliases: ['loc', 'locrian'] },
];

/** Option suffixes that normalize to bare root (major). */
const MAJOR_OPTION_SUFFIXES = ['major', 'ionian'];

/** Option suffixes that normalize to root + 'm' (minor family). */
const MINOR_OPTION_SUFFIXES = [
  'aeolian',
  'naturalminor',
  'harmonicminor',
  'melodicminor',
];

/** Named modes kept as concatenated full names. */
const MODE_OPTION_SUFFIXES = [
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
];

function normalizeAliasKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, '');
}

/**
 * Compact form for matching: ignore spaces, punctuation, and capitalisation.
 * "D DoRIan" and "Ddorian" both become "ddorian".
 */
export function keySignatureMatchKey(text) {
  return normalizeAliasKey(text);
}

/**
 * react-select filterOption: match ignoring spaces and mode capitalisation.
 */
export function filterKeySignatureOption(option, rawInput) {
  const input = keySignatureMatchKey(rawInput);
  if (!input) return true;
  const label = keySignatureMatchKey(option && (option.label || option.value));
  const value = keySignatureMatchKey(option && option.value);
  if (label.indexOf(input) >= 0 || value.indexOf(input) >= 0) return true;
  const canonical = normalizeKeySignature(rawInput);
  if (canonical && keySignatureMatchKey(canonical) === value) return true;
  return false;
}

const ALIAS_TO_MODE = (function() {
  const map = {};
  MODE_DEFS.forEach(function(def) {
    def.aliases.forEach(function(alias) {
      map[normalizeAliasKey(alias)] = def;
    });
  });
  return map;
})();

/**
 * ABC highland pipe keys: HP (no signature) vs Hp (F# C# Gnat).
 * Only exact "Hp" (capital H, lowercase p) maps to Hp; other case variants → HP.
 */
function normalizePipeKey(text) {
  const trimmed = String(text || '').trim();
  if (!/^hp$/i.test(trimmed)) return null;
  if (trimmed === 'Hp') return 'Hp';
  return 'HP';
}

function parseRootAndRest(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const match = raw.match(/^([A-Ga-g])([#b]?)\s*(.*)$/);
  if (!match) return null;
  let root = match[1].toUpperCase();
  const accidental = match[2] || '';
  if (accidental === '#') root += '#';
  if (accidental === 'b') root += 'b';
  return { root: root, rest: String(match[3] || '').trim() };
}

function resolveModeFromToken(token) {
  const key = normalizeAliasKey(token);
  if (!key) return ALIAS_TO_MODE[''] || MODE_DEFS[0];
  if (ALIAS_TO_MODE[key]) return ALIAS_TO_MODE[key];

  // Prefer longest alias match as prefix (e.g. Amix → mix, Adorian → dorian).
  let best = null;
  let bestLen = 0;
  Object.keys(ALIAS_TO_MODE).forEach(function(alias) {
    if (!alias) return;
    if (key === alias || key.indexOf(alias) === 0) {
      if (alias.length > bestLen) {
        best = ALIAS_TO_MODE[alias];
        bestLen = alias.length;
      }
    }
  });
  if (best && bestLen >= 3) return best;
  return null;
}

/**
 * Parse a free-text key into root + mode kind, or null if unrecognized.
 * Pipe keys are not represented here — use normalizeKeySignature.
 */
export function parseKeySignatureMode(keyText) {
  if (normalizePipeKey(keyText)) return null;
  const parts = parseRootAndRest(keyText);
  if (!parts) return null;
  const mode = resolveModeFromToken(parts.rest);
  if (!mode) return null;
  return {
    root: parts.root,
    kind: mode.kind,
    canonicalSuffix: mode.canonical,
  };
}

/**
 * Canonical stored form: A, Am, Amixolydian, F#dorian, HP, Hp, …
 * Unrecognized input is returned trimmed (soft normalize).
 */
export function normalizeKeySignature(keyText) {
  const trimmed = String(keyText || '').trim();
  if (!trimmed) return '';
  const pipe = normalizePipeKey(trimmed);
  if (pipe) return pipe;
  const parsed = parseKeySignatureMode(trimmed);
  if (!parsed) return trimmed;
  if (parsed.kind === 'major') return parsed.root;
  if (parsed.kind === 'minor') return parsed.root + 'm';
  return parsed.root + parsed.canonicalSuffix;
}

/**
 * When typed value differs from canonical, return the suggestion; else null.
 */
export function suggestKeySignature(keyText) {
  const trimmed = String(keyText || '').trim();
  if (!trimmed) return null;
  const canonical = normalizeKeySignature(trimmed);
  if (!canonical || canonical === trimmed) return null;
  return canonical;
}

/** Pitch class for common root spellings. */
const ROOT_TO_PC = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

const PC_TO_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_TO_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Standard major-key accidental count by relative-major pitch class.
 * Positive = sharps, negative = flats. PC 6 is F#/Gb (6 accidentals either
 * way); transposeKeySignature breaks that tie from the source spelling.
 */
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

/**
 * Semitone offset from mode tonic to the major key with the same signature.
 * major/ionian: 0; minor/aeolian: +3; dorian: -2; etc.
 */
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

function pitchClassForRoot(root) {
  if (!root || ROOT_TO_PC[root] == null) return null;
  return ROOT_TO_PC[root];
}

function formatKeyFromParsed(root, parsed) {
  if (!parsed) return root;
  if (parsed.kind === 'major') return root;
  if (parsed.kind === 'minor') return root + 'm';
  return root + (parsed.canonicalSuffix || '');
}

/**
 * True when the key signature uses flats (accidentals &lt; 0).
 * Explicit flat/sharp tonics (Ebm, Gb, D#m, F#) follow the tonic spelling
 * so Gb/Ebm stay on the flat side even though F#/D#m share that pitch class.
 * Zero-accidental keys (C, Am, Ddorian, …) return false (prefer sharps).
 * Pipe keys and unrecognized input return false.
 */
export function keyPrefersFlats(keyText) {
  const trimmed = String(keyText || '').trim();
  if (!trimmed || normalizePipeKey(trimmed)) return false;
  const parsed = parseKeySignatureMode(trimmed);
  if (!parsed) return false;
  if (parsed.root && parsed.root.indexOf('b') >= 0) return true;
  if (parsed.root && parsed.root.indexOf('#') >= 0) return false;
  const rootPc = pitchClassForRoot(parsed.root);
  if (rootPc == null) return false;
  const relativeMajorPc = (rootPc + relativeMajorOffset(parsed) + 12) % 12;
  const accidentals = MAJOR_PC_ACCIDENTALS[relativeMajorPc];
  return typeof accidentals === 'number' && accidentals < 0;
}

/**
 * Transpose a key signature by semitones, preserving mode and spelling the
 * new root with flats/sharps appropriate to the resulting signature.
 */
export function transposeKeySignature(keyText, semitones) {
  const trimmed = String(keyText || '').trim();
  if (!trimmed) return '';
  const pipe = normalizePipeKey(trimmed);
  if (pipe) return pipe;
  const parsed = parseKeySignatureMode(trimmed);
  if (!parsed) return trimmed;
  const rootPc = pitchClassForRoot(parsed.root);
  if (rootPc == null) return trimmed;
  const amount = Number(semitones) || 0;
  const nextPc = (rootPc + (amount % 12) + 12) % 12;
  const relativeMajorPc = (nextPc + relativeMajorOffset(parsed) + 12) % 12;
  const accidentals = MAJOR_PC_ACCIDENTALS[relativeMajorPc];
  // F#/Gb (and relatives D#m/Ebm) both have 6 accidentals. Stay on the
  // source's flat/sharp side so Dm+1 is Ebm, not D#m.
  let preferFlats = typeof accidentals === 'number' && accidentals < 0;
  if (accidentals === 6) preferFlats = keyPrefersFlats(trimmed);
  const nextRoot = preferFlats ? PC_TO_FLAT[nextPc] : PC_TO_SHARP[nextPc];
  return formatKeyFromParsed(nextRoot, parsed);
}

function option(value) {
  return { value: value, label: value };
}

/**
 * CreatableSelect option list: majors, minors, discoverability aliases, modes, pipes.
 */
export function listKeySignatureOptions() {
  const options = [];
  const seen = {};

  function push(value) {
    if (!value || seen[value]) return;
    seen[value] = true;
    options.push(option(value));
  }

  ROOTS.forEach(function(root) {
    push(root);
    push(root + 'm');
    MAJOR_OPTION_SUFFIXES.forEach(function(suffix) {
      push(root + suffix);
    });
    MINOR_OPTION_SUFFIXES.forEach(function(suffix) {
      push(root + suffix);
    });
    MODE_OPTION_SUFFIXES.forEach(function(suffix) {
      push(root + suffix);
    });
  });

  push('HP');
  push('Hp');

  return options;
}
