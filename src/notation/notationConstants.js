/** MuseScore duration key → multiplier of unit note length (L:) */
export const DURATION_KEY_MULTIPLIERS = {
  1: 1 / 8,
  2: 1 / 4,
  3: 1 / 2,
  4: 1,
  5: 2,
  6: 4,
  7: 8,
  8: 16,
  9: 32,
};

export const EDITOR_MODES = {
  NORMAL: 'normal',
  NOTE_INPUT: 'noteInput',
};

/** MuseScore-aligned step-time note input methods while EDITOR_MODES.NOTE_INPUT is on. */
export const NOTE_INPUT_METHODS = {
  NOTE_NAME: 'noteName',
  DURATION: 'duration',
  RHYTHM: 'rhythm',
  RE_PITCH: 'rePitch',
  INSERT: 'insert',
};

export const NOTE_INPUT_METHOD_LABELS = {
  noteName: 'Note name',
  duration: 'Duration',
  rhythm: 'Rhythm',
  rePitch: 'Re-pitch',
  insert: 'Insert',
};

export const EDITOR_VIEWS = {
  STAFF: 'staff',
  PIANO_ROLL: 'pianoRoll',
  SPLIT: 'split',
  ABC: 'abc',
  CHORDS: 'chords',
  HELP: 'help',
};

export const PIANO_ROLL_TOOLS = {
  SELECT: 'select',
  DRAW: 'draw',
  SPLIT: 'split',
  ERASE: 'erase',
};

/** Staff marquee without Shift (desktop) or long-press (touch). */
export const STAFF_SELECTION_TOOLS = {
  NORMAL: 'normal',
  MARQUEE: 'marquee',
};

export const MIDI_CHORD_MODES = {
  STEP_CHORD: 'stepChord',
  ADD_TONE: 'addTone',
  SINGLE: 'single',
};

export const BARLINE_TOKENS = {
  SINGLE: '|',
  DOUBLE: '||',
  START_REPEAT: '|:',
  END_REPEAT: ':|',
  BOTH_REPEAT: ':|:',
  FINAL: '|]',
  SECTION: '[|',
};

export const DEFAULT_MIDI_CHORD_WINDOW_MS = 50;
export const DEFAULT_QUANTIZE_STRENGTH = 1;
export const DEFAULT_SNAP_SLOTS_PER_BEAT = 4;
