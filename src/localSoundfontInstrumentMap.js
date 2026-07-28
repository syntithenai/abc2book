/**
 * Maps GM MIDI program numbers onto the embedded MusyngKite selection
 * for fast interactive MIDI playback.
 *
 * Embedded instruments (midi-js-soundfonts/selection/MusyngKite + abcjs piano):
 * accordion, acoustic_grand_piano, acoustic_guitar_nylon, acoustic_guitar_steel,
 * acoustic_bass, brass_section, cello, choir_aahs, fiddle, flute, harmonica,
 * orchestral_harp, pizzicato_strings, slap_bass_1, string_ensemble_1, violin.
 */

export const LOCAL_SOUNDFONT_INSTRUMENTS = Object.freeze([
  'accordion',
  'acoustic_grand_piano',
  'acoustic_guitar_nylon',
  'acoustic_guitar_steel',
  'acoustic_bass',
  'brass_section',
  'cello',
  'choir_aahs',
  'fiddle',
  'flute',
  'harmonica',
  'orchestral_harp',
  'pizzicato_strings',
  'slap_bass_1',
  'string_ensemble_1',
  'violin',
]);

/** GM program number for each local instrument name. */
export const LOCAL_INSTRUMENT_PROGRAMS = Object.freeze({
  acoustic_grand_piano: 0,
  accordion: 21,
  harmonica: 22,
  acoustic_guitar_nylon: 24,
  acoustic_guitar_steel: 25,
  acoustic_bass: 32,
  slap_bass_1: 36,
  violin: 40,
  cello: 42,
  pizzicato_strings: 46,
  orchestral_harp: 47,
  string_ensemble_1: 48,
  choir_aahs: 52,
  brass_section: 61,
  flute: 73,
  fiddle: 108,
});

const SHIPPED_GM_PROGRAMS = new Set(
  Object.values(LOCAL_INSTRUMENT_PROGRAMS).map(function(p) { return Math.floor(p) % 128; })
);

const DEFAULT_PROGRAM = LOCAL_INSTRUMENT_PROGRAMS.acoustic_grand_piano;

/**
 * @param {number} program GM program 0–127
 * @returns {boolean}
 */
export function isLocalGmProgramShipped(program) {
  const p = Math.floor(Number(program)) % 128;
  if (!Number.isFinite(p) || p < 0) return false;
  return SHIPPED_GM_PROGRAMS.has(p);
}

/**
 * @param {number} program GM program 0–127
 * @returns {number} Local stand-in program number
 */
export function remapGmProgramToLocal(program) {
  const n = Number(program);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PROGRAM;
  const p = Math.floor(n) % 128;

  if (isLocalGmProgramShipped(p)) return p;

  // Piano / chromatic keys / FX / percussion-ish
  if (p <= 15) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_grand_piano;
  // Organs
  if (p >= 16 && p <= 20) return LOCAL_INSTRUMENT_PROGRAMS.accordion;
  if (p === 21) return LOCAL_INSTRUMENT_PROGRAMS.accordion;
  if (p === 22) return LOCAL_INSTRUMENT_PROGRAMS.harmonica;
  if (p === 23) return LOCAL_INSTRUMENT_PROGRAMS.accordion;
  // Guitars
  if (p >= 24 && p <= 26) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_guitar_nylon;
  if (p >= 27 && p <= 31) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_guitar_steel;
  // Basses
  if (p >= 32 && p <= 35) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_bass;
  if (p >= 36 && p <= 39) return LOCAL_INSTRUMENT_PROGRAMS.slap_bass_1;
  // Solo strings
  if (p === 40 || p === 41) return LOCAL_INSTRUMENT_PROGRAMS.violin;
  if (p === 42 || p === 43) return LOCAL_INSTRUMENT_PROGRAMS.cello;
  if (p === 44 || p === 45) return LOCAL_INSTRUMENT_PROGRAMS.fiddle;
  if (p === 46) return LOCAL_INSTRUMENT_PROGRAMS.pizzicato_strings;
  if (p === 47) return LOCAL_INSTRUMENT_PROGRAMS.orchestral_harp;
  // Ensembles
  if (p >= 48 && p <= 51) return LOCAL_INSTRUMENT_PROGRAMS.string_ensemble_1;
  if (p === 55) return LOCAL_INSTRUMENT_PROGRAMS.brass_section;
  // Choir / voice
  if (p >= 52 && p <= 54) return LOCAL_INSTRUMENT_PROGRAMS.choir_aahs;
  // Brass
  if (p >= 56 && p <= 63) return LOCAL_INSTRUMENT_PROGRAMS.brass_section;
  // Reeds / winds
  if (p >= 64 && p <= 71) return LOCAL_INSTRUMENT_PROGRAMS.flute;
  if (p === 72 || p === 73 || p === 74) return LOCAL_INSTRUMENT_PROGRAMS.flute;
  if (p >= 75 && p <= 79) return LOCAL_INSTRUMENT_PROGRAMS.flute;
  // Leads / pads / FX
  if (p >= 80 && p <= 103) return LOCAL_INSTRUMENT_PROGRAMS.choir_aahs;
  // Ethnic
  if (p >= 104 && p <= 107) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_guitar_steel;
  if (p === 108) return LOCAL_INSTRUMENT_PROGRAMS.fiddle;
  if (p === 109) return LOCAL_INSTRUMENT_PROGRAMS.flute;
  // Percussion / sound effects
  if (p >= 110) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_grand_piano;

  return DEFAULT_PROGRAM;
}

/**
 * Mutate an abcjs flattened MIDI sequence so every program/note instrument
 * id maps onto the local embedded soundfont set.
 * @param {{ tracks?: Array<Array<{cmd?: string, instrument?: number}>> }} sequence
 * @returns {typeof sequence}
 */
export function remapFlattenedMidiPrograms(sequence) {
  if (!sequence || !Array.isArray(sequence.tracks)) return sequence;
  sequence.tracks.forEach(function(track) {
    if (!Array.isArray(track)) return;
    track.forEach(function(ev) {
      if (!ev || ev.instrument === undefined || ev.instrument === null) return;
      if (ev.cmd === 'program' || ev.cmd === 'note' || ev.pitch !== undefined) {
        ev.instrument = remapGmProgramToLocal(ev.instrument);
      }
    });
  });
  return sequence;
}

export function isLocalSoundfontInstrument(name) {
  return LOCAL_SOUNDFONT_INSTRUMENTS.indexOf(String(name || '')) >= 0;
}

/** Instrument folder names shipped under selection/MusyngKite (for fetch/precache). */
export const SELECTION_SOUNDFONT_INSTRUMENTS = LOCAL_SOUNDFONT_INSTRUMENTS.slice();
