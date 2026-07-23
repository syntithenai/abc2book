import {
  audioFiltersAreNeutral,
  getAudioFilterKeysForStemNames,
  getAudioFilterSettings,
  getMediaPlaybackSettings,
  normalizeAudioFilters,
  pitchShiftIsActive,
  playbackNeedsExternalProcessing,
} from './pitchTempoUtils';

describe('audio filter settings', function() {
  test('defaults all stems to full volume', function() {
    expect(getAudioFilterSettings(null)).toEqual({
      percussion: 1,
      vocals: 1,
      bass: 1,
      guitar: 1,
      piano: 1,
      other: 1,
    });
  });

  test('detects non-neutral filters', function() {
    expect(audioFiltersAreNeutral({ percussion: 1, vocals: 0, bass: 1, other: 1 })).toBe(false);
    expect(audioFiltersAreNeutral({ percussion: 1, vocals: 1, bass: 1, other: 1 })).toBe(true);
  });

  test('requires external processing when filters are active', function() {
    const settings = getMediaPlaybackSettings({
      playbackTempo: 1,
      playbackPitch: 0,
      playbackFineTune: 0,
      playbackAudioFilters: { percussion: 1, vocals: 0.5, bass: 1, other: 1 },
    });
    expect(playbackNeedsExternalProcessing(settings)).toBe(true);
  });

  test('detects active pitch shift', function() {
    expect(pitchShiftIsActive(0, 0)).toBe(false);
    expect(pitchShiftIsActive(2, 0)).toBe(true);
    expect(pitchShiftIsActive(0, 25)).toBe(true);
  });

  test('clamps filter values', function() {
    expect(normalizeAudioFilters({ percussion: 3, vocals: -1, bass: 0.5, other: 'bad' })).toEqual({
      percussion: 2,
      vocals: 0,
      bass: 0.5,
      guitar: 1,
      piano: 1,
      other: 1,
    });
  });

  test('maps available stem names to the matching UI sliders', function() {
    expect(getAudioFilterKeysForStemNames(['drums', 'bass', 'other', 'vocals'])).toEqual([
      'percussion', 'vocals', 'bass', 'other',
    ]);
    expect(getAudioFilterKeysForStemNames(['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'])).toEqual([
      'percussion', 'vocals', 'bass', 'guitar', 'piano', 'other',
    ]);
    expect(getAudioFilterKeysForStemNames(['drums', 'bass', 'other', 'vocal'])).toEqual([
      'percussion', 'vocals', 'bass', 'other',
    ]);
  });
});
