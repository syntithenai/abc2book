import { gmNameAt } from './gmInstrumentNames';

/** True for default exporter names like "Track 1" / "track 2". */
export function isGenericMidiTrackName(name) {
  return /^track\s/i.test(String(name || '').trim());
}

export function gmInstrumentDisplayName(program) {
  return gmNameAt(program || 0).replace(/_/g, ' ');
}

/**
 * Voice label for notation: real track name, else GM instrument, else fallback.
 */
export function displayNameForMidiTrack(voice) {
  const voiceId = voice && voice.id != null ? voice.id : 1;
  const rawName = voice && voice.name ? String(voice.name).trim() : '';
  if (rawName && !isGenericMidiTrackName(rawName)) {
    return rawName;
  }
  if (voice && voice.isDrum) {
    return 'Drums ' + voiceId;
  }
  const gmName = gmInstrumentDisplayName(voice && voice.program);
  if (gmName) return gmName;
  return 'Voice ' + voiceId;
}

export function buildVoiceProgramPrefix(voice) {
  if (!voice || voice.isDrum) return [];
  const program = Number(voice.program);
  if (!Number.isFinite(program) || program < 0) return [];
  return ['%%MIDI program ' + program];
}
