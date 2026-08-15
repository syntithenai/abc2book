import GM_NAMES, { gmNameAt } from '../gmInstrumentNames';

/** Clefs commonly written on ABC `V:` lines and understood by abcjs / xml2abc. */
export const VOICE_CLEFS = Object.freeze([
  'treble',
  'treble-8',
  'treble+8',
  'alto',
  'tenor',
  'bass',
  'bass+8',
  'perc',
]);

export const DEFAULT_VOICE_CLEF = 'treble';
export const DEFAULT_MIDI_PROGRAM = 0;

const CLEF_TOKEN_RE = /^clef=(.+)$/i;
const MIDI_PROGRAM_RE = /^%%MIDI\s+program\s+(\d+)\b/i;
const ATTR_TOKEN_RE = /^[a-zA-Z][\w-]*=/;

/** xml2abc also emits these as bare V: tokens (abcm2ps shorthand). */
const BARE_CLEF_TOKENS = new Set(VOICE_CLEFS.concat(['alto1', 'alto2', 'bass3']));

function isBareClefToken(token) {
  return BARE_CLEF_TOKENS.has(String(token || '').toLowerCase());
}

/**
 * Parse free-form ABC V: metadata into structured fields.
 * Example: `Piano clef=bass stem=up` → { name: 'Piano', clef: 'bass', extra: 'stem=up' }
 * xml2abc shorthand `bass nm="Piano"` is treated as clef=bass, not a voice named bass.
 */
const NM_ATTR_RE = /^nm=(?:"([^"]*)"|'([^']*)')$/i;

export function parseVoiceMeta(metaStr) {
  if (metaStr && typeof metaStr === 'object' && !Array.isArray(metaStr)) {
    const name = metaStr.name != null ? String(metaStr.name).trim() : '';
    const clef = metaStr.clef ? String(metaStr.clef).trim() : DEFAULT_VOICE_CLEF;
    const extra = metaStr.extra != null ? String(metaStr.extra).trim() : '';
    return {
      name: name === '[object Object]' ? '' : name,
      clef: clef || DEFAULT_VOICE_CLEF,
      extra: extra,
    };
  }
  const tokens = String(metaStr || '').trim().split(/\s+/).filter(Boolean);
  const hasClefAttr = tokens.some(function(token) {
    return CLEF_TOKEN_RE.test(token);
  });
  let clef = DEFAULT_VOICE_CLEF;
  let nmName = '';
  const nameParts = [];
  const extraParts = [];
  tokens.forEach(function(token) {
    const clefMatch = token.match(CLEF_TOKEN_RE);
    if (clefMatch) {
      clef = clefMatch[1] || DEFAULT_VOICE_CLEF;
      return;
    }
    const nmMatch = token.match(NM_ATTR_RE);
    if (nmMatch) {
      nmName = (nmMatch[1] != null ? nmMatch[1] : nmMatch[2]) || '';
      return;
    }
    if (!hasClefAttr && isBareClefToken(token)) {
      clef = token.toLowerCase();
      return;
    }
    if (ATTR_TOKEN_RE.test(token) || /^nm=/i.test(token)) {
      extraParts.push(token);
      return;
    }
    nameParts.push(token);
  });
  const plainName = nameParts.join(' ');
  return {
    name: plainName || nmName,
    clef: clef,
    extra: extraParts.join(' '),
  };
}

/** Format structured voice fields back to an ABC V: meta string (without the V:id prefix). */
export function formatVoiceMeta(fields) {
  const f = fields || {};
  const parts = [];
  const name = String(f.name != null ? f.name : '').trim();
  if (name) parts.push(name);
  const clef = String(f.clef || DEFAULT_VOICE_CLEF).trim() || DEFAULT_VOICE_CLEF;
  parts.push('clef=' + clef);
  const extra = String(f.extra || '').trim();
  if (extra) parts.push(extra);
  return parts.join(' ');
}

export function defaultVoiceMeta(displayName) {
  return formatVoiceMeta({
    name: displayName || 'Voice 1',
    clef: DEFAULT_VOICE_CLEF,
    extra: '',
  });
}

/** Coerce stored voice meta (string or legacy object) to an ABC V: suffix. */
export function voiceMetaToAbcString(meta) {
  if (meta == null || meta === '') return '';
  if (typeof meta === 'string') return meta.trim();
  return formatVoiceMeta(parseVoiceMeta(meta));
}

export function voiceLines(notes) {
  if (Array.isArray(notes)) return notes.map(function(line) { return String(line == null ? '' : line); });
  if (notes == null || notes === '') return [''];
  return String(notes).split('\n');
}

export function isMidiProgramLine(line) {
  return MIDI_PROGRAM_RE.test(String(line || '').trim());
}

export function parseMidiProgramFromNotes(notes) {
  const lines = voiceLines(notes);
  for (let i = 0; i < lines.length; i++) {
    const match = String(lines[i]).trim().match(MIDI_PROGRAM_RE);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n >= 0 && n <= 127) return n;
    }
  }
  return DEFAULT_MIDI_PROGRAM;
}

export function stripMidiProgramFromNotes(notes) {
  const lines = voiceLines(notes).filter(function(line) {
    return !isMidiProgramLine(line);
  });
  return lines.length ? lines : [''];
}

export function setMidiProgramInNotes(notes, program) {
  const cleaned = stripMidiProgramFromNotes(notes);
  const p = Math.max(0, Math.min(127, Math.floor(Number(program))));
  const safe = Number.isFinite(p) ? p : DEFAULT_MIDI_PROGRAM;
  const withoutLeadingEmpty = cleaned.slice();
  while (withoutLeadingEmpty.length > 1 && !String(withoutLeadingEmpty[0]).trim()) {
    withoutLeadingEmpty.shift();
  }
  return ['%%MIDI program ' + safe].concat(withoutLeadingEmpty);
}

/** Ensure serialized note body keeps a leading %%MIDI program line. */
export function withMidiProgramPrefix(bodyText, program) {
  const p = Math.max(0, Math.min(127, Math.floor(Number(program))));
  const safe = Number.isFinite(p) ? p : DEFAULT_MIDI_PROGRAM;
  const lines = stripMidiProgramFromNotes(String(bodyText || '').split('\n'));
  const joined = lines.join('\n').replace(/^\n+/, '');
  return ('%%MIDI program ' + safe + (joined ? '\n' + joined : '')).replace(/\n+$/, '');
}

export function midiProgramToInstrumentName(program) {
  return gmNameAt(program);
}

export function instrumentNameToMidiProgram(name) {
  const key = String(name || '').trim();
  const idx = GM_NAMES.indexOf(key);
  return idx >= 0 ? idx : DEFAULT_MIDI_PROGRAM;
}

export function listInstrumentOptions() {
  return GM_NAMES.map(function(name, program) {
    return { program: program, name: name, label: name.replace(/_/g, ' ') };
  });
}
