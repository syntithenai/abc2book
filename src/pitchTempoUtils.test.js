import { setGlobalTempoPercent } from './globalTempoSettings';
import {
  audioFiltersAreNeutral,
  getAudioFilterKeysForStemNames,
  getAudioFilterSettings,
  getMediaPlaybackSettings,
  getPlaybackSettings,
  getTunePlaybackSettings,
  normalizeAudioFilters,
  normalizePlaybackFields,
  pitchShiftIsActive,
  playbackNeedsExternalProcessing,
} from './pitchTempoUtils';

describe('audio filter settings', function() {
  beforeEach(function() {
    localStorage.clear();
  });

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

describe('global tempo override', function() {
  const tune = {
    playbackTempo: 0.5,
    playbackPitch: 2,
    playbackFineTune: 10,
  };

  beforeEach(function() {
    localStorage.clear();
  });

  test('uses the song tempo when the profile override is off', function() {
    expect(getPlaybackSettings(tune).tempo).toBe(0.5);
    expect(getTunePlaybackSettings(tune).tempo).toBe(0.5);
  });

  test('replaces the song tempo when the profile override is set', function() {
    setGlobalTempoPercent(80);
    expect(getTunePlaybackSettings(tune).tempo).toBe(0.5);
    expect(getPlaybackSettings(tune)).toEqual({
      tempo: 0.8,
      pitch: 2,
      fineTune: 10,
    });
    expect(getMediaPlaybackSettings(tune).tempo).toBe(0.8);
  });

  test('does not persist the override onto the song', function() {
    setGlobalTempoPercent(125);
    const next = normalizePlaybackFields(Object.assign({}, tune));
    expect(next.playbackTempo).toBe(0.5);
  });
});
