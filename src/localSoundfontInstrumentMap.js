/**
 * Maps GM MIDI program numbers onto the small embedded MusyngKite selection
 * when the full resolver bank is unavailable.
 *
 * Embedded instruments (midi-js-soundfonts/selection/MusyngKite + abcjs piano):
 * accordion, acoustic_grand_piano, acoustic_guitar_steel, brass_section,
 * choir_aahs, fiddle, flute, harmonica, slap_bass_1, violin.
 */

export const LOCAL_SOUNDFONT_INSTRUMENTS = Object.freeze([
  'accordion',
  'acoustic_grand_piano',
  'acoustic_guitar_steel',
  'brass_section',
  'choir_aahs',
  'fiddle',
  'flute',
  'harmonica',
  'slap_bass_1',
  'violin',
]);

/** GM program number for each local instrument name. */
export const LOCAL_INSTRUMENT_PROGRAMS = Object.freeze({
  acoustic_grand_piano: 0,
  accordion: 21,
  harmonica: 22,
  acoustic_guitar_steel: 25,
  slap_bass_1: 36,
  violin: 40,
  choir_aahs: 52,
  brass_section: 61,
  flute: 73,
  fiddle: 108,
});

const DEFAULT_PROGRAM = 0;

/**
 * @param {number} program GM program 0–127
 * @returns {number} Local stand-in program number
 */
export function remapGmProgramToLocal(program) {
  const n = Number(program);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PROGRAM;
  const p = Math.floor(n) % 128;

  // Exact match for an instrument we ship locally
  for (const name of LOCAL_SOUNDFONT_INSTRUMENTS) {
    if (LOCAL_INSTRUMENT_PROGRAMS[name] === p) return p;
  }

  // Piano / chromatic keys / FX / percussion-ish
  if (p <= 15) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_grand_piano;
  // Organs
  if (p >= 16 && p <= 20) return LOCAL_INSTRUMENT_PROGRAMS.accordion;
  // Accordion / harmonica / tango accordion
  if (p === 21) return LOCAL_INSTRUMENT_PROGRAMS.accordion;
  if (p === 22) return LOCAL_INSTRUMENT_PROGRAMS.harmonica;
  if (p === 23) return LOCAL_INSTRUMENT_PROGRAMS.accordion;
  // Guitars
  if (p >= 24 && p <= 31) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_guitar_steel;
  // Basses
  if (p >= 32 && p <= 39) return LOCAL_INSTRUMENT_PROGRAMS.slap_bass_1;
  // Solo strings
  if (p === 40 || p === 41) return LOCAL_INSTRUMENT_PROGRAMS.violin;
  if (p === 42 || p === 43) return LOCAL_INSTRUMENT_PROGRAMS.violin;
  if (p === 44 || p === 45) return LOCAL_INSTRUMENT_PROGRAMS.fiddle;
  if (p === 46 || p === 47) return LOCAL_INSTRUMENT_PROGRAMS.acoustic_grand_piano;
  // Ensembles
  if (p >= 48 && p <= 51) return LOCAL_INSTRUMENT_PROGRAMS.brass_section;
  // Choir / voice
  if (p >= 52 && p <= 54) return LOCAL_INSTRUMENT_PROGRAMS.choir_aahs;
  if (p === 55) return LOCAL_INSTRUMENT_PROGRAMS.brass_section;
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
