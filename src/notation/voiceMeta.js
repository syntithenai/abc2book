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

/**
 * Parse free-form ABC V: metadata into structured fields.
 * Example: `Piano clef=bass stem=up` → { name: 'Piano', clef: 'bass', extra: 'stem=up' }
 */
export function parseVoiceMeta(metaStr) {
  const tokens = String(metaStr || '').trim().split(/\s+/).filter(Boolean);
  let clef = DEFAULT_VOICE_CLEF;
  const nameParts = [];
  const extraParts = [];
  tokens.forEach(function(token) {
    const clefMatch = token.match(CLEF_TOKEN_RE);
    if (clefMatch) {
      clef = clefMatch[1] || DEFAULT_VOICE_CLEF;
      return;
    }
    if (ATTR_TOKEN_RE.test(token) || /^nm=/i.test(token)) {
      extraParts.push(token);
      return;
    }
    nameParts.push(token);
  });
  return {
    name: nameParts.join(' '),
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
