/**
 * abcjs programOffsets shift note starts earlier (ms) so soft sample attacks land
 * on the beat. Calibrated for the original soft-attack abcjs soundfont bank.
 * Shared by live playback (useAbcSynth), preview synth, and notation audio export.
 */
export const ABC_SYNTH_PROGRAM_OFFSETS = {
  bright_acoustic_piano: 55,
  honkytonk_piano: 55,
  electric_piano_1: 45,
  electric_piano_2: 45,
  harpsichord: 40,
  clavinet: 20,
  celesta: 20,
  glockenspiel: 40,
  vibraphone: 30,
  marimba: 35,
  xylophone: 30,
  tubular_bells: 35,
  dulcimer: 30,
  drawbar_organ: 20,
  percussive_organ: 25,
  rock_organ: 20,
  church_organ: 40,
  reed_organ: 40,
  accordion: 40,
  harmonica: 40,
  acoustic_guitar_nylon: 15,
  acoustic_guitar_steel: 20,
  electric_guitar_jazz: 25,
  electric_guitar_clean: 15,
  electric_guitar_muted: 35,
  overdriven_guitar: 25,
  distortion_guitar: 20,
  guitar_harmonics: 30,
  electric_bass_finger: 15,
  electric_bass_pick: 30,
  fretless_bass: 40,
  violin: 35,
  viola: 30,
  cello: 30,
  contrabass: 40,
  trumpet: 10,
  trombone: 90,
  alto_sax: 15,
  tenor_sax: 15,
  clarinet: 15,
  flute: 18,
  tin_whistle: 15,
  recorder: 18,
  banjo: 30,
  mandolin: 25,
  woodblock: 20,
};

/**
 * MusyngKite / FluidR3 samples already have tighter onsets; abcjs defaults to
 * empty offsets for those banks. Applying original-bank offsets there shifts
 * note peaks early vs a metronome on the notated grid (~35ms median lead).
 */
export function programOffsetsForSoundFontUrl(soundFontUrl) {
  const url = String(soundFontUrl || '')
  if (/MusyngKite|FluidR3/i.test(url)) {
    return {}
  }
  return ABC_SYNTH_PROGRAM_OFFSETS
}

/**
 * Selection-bank playback remaps onto MusyngKite samples; never apply
 * original-bank attack offsets (they swallow short sixteenth melody notes).
 * @param {string} soundFontUrl
 * @param {{ remap?: boolean }} [soundFontPlan]
 */
export function programOffsetsForPlaybackPlan(soundFontUrl, soundFontPlan) {
  if (soundFontPlan && soundFontPlan.remap) {
    return {}
  }
  return programOffsetsForSoundFontUrl(soundFontUrl)
}

/** abcjs default fadeLength is 200ms — tails overlap on fast 16th runs and mask attacks. */
export const ABCJS_PLAYBACK_FADE_LENGTH_MS = 0
export const ABCJS_PLAYBACK_NOTE_END_MS = 0

export function abcjsPlaybackSynthOptions(extra) {
  return Object.assign({
    fadeLength: ABCJS_PLAYBACK_FADE_LENGTH_MS,
    noteEnd: ABCJS_PLAYBACK_NOTE_END_MS,
  }, extra || {})
}
