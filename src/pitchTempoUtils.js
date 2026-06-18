export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 2.0;
export const PITCH_MIN = -12;
export const PITCH_MAX = 12;
export const FINE_TUNE_MIN = -50;
export const FINE_TUNE_MAX = 50;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function combinedPitchSemitones(pitchSemitones, fineTuneCents) {
  return clamp(pitchSemitones, PITCH_MIN, PITCH_MAX) + clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX) / 100;
}

export function formatPitchDisplay(pitch) {
  if (pitch === 0) return 'Original';
  return `${pitch > 0 ? '+' : ''}${pitch} st`;
}

export function formatFineTuneDisplay(cents) {
  if (cents === 0) return '0¢';
  return `${cents > 0 ? '+' : ''}${cents}¢`;
}

export function getPlaybackSettings(tune) {
  if (!tune) {
    return { tempo: 1, pitch: 0, fineTune: 0 };
  }
  const tempo = tune.playbackTempo > 0 ? parseFloat(tune.playbackTempo) : 1;
  const pitch = tune.playbackPitch !== undefined && tune.playbackPitch !== null && tune.playbackPitch !== ''
    ? parseInt(tune.playbackPitch, 10) : 0;
  const fineTune = tune.playbackFineTune !== undefined && tune.playbackFineTune !== null && tune.playbackFineTune !== ''
    ? parseInt(tune.playbackFineTune, 10) : 0;
  return {
    tempo: clamp(tempo, TEMPO_MIN, TEMPO_MAX),
    pitch: clamp(isNaN(pitch) ? 0 : pitch, PITCH_MIN, PITCH_MAX),
    fineTune: clamp(isNaN(fineTune) ? 0 : fineTune, FINE_TUNE_MIN, FINE_TUNE_MAX),
  };
}

export function normalizePlaybackFields(tune) {
  if (!tune) return tune;
  const settings = getPlaybackSettings(tune);
  tune.playbackTempo = settings.tempo;
  tune.playbackPitch = settings.pitch;
  tune.playbackFineTune = settings.fineTune;
  return tune;
}
