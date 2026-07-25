import {
  defaultVoiceViewSettings,
  getPlayableVoiceKeys,
  getPlaybackVoiceKeys,
  getVoiceViewSettings,
  hasFilteredPlaybackVoices,
  normalizeVoiceViewSettings,
  selectedVoiceKeys,
  setVoiceViewSettings,
} from './abcVoiceViewSettings';

describe('abcVoiceViewSettings', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('defaults all voices to visible and playable', function() {
    const settings = defaultVoiceViewSettings(['1', '2']);
    expect(settings.visible).toEqual({ '1': true, '2': true });
    expect(settings.playable).toEqual({ '1': true, '2': true });
  });

  test('persists per tune in localStorage', function() {
    setVoiceViewSettings('tune-a', {
      visible: { '1': true, '2': false },
      playable: { '1': false, '2': true },
    }, ['1', '2']);

    expect(getVoiceViewSettings('tune-a', ['1', '2'])).toEqual({
      visible: { '1': true, '2': false },
      playable: { '1': false, '2': true },
    });
  });

  test('selectedVoiceKeys keeps at least one voice', function() {
    expect(selectedVoiceKeys(['1', '2'], { '1': false, '2': false })).toEqual(['1']);
  });

  test('normalizeVoiceViewSettings adds new voices as enabled', function() {
    const normalized = normalizeVoiceViewSettings(['1', '2', '3'], {
      visible: { '1': false },
      playable: { '2': false },
    });
    expect(normalized.visible).toEqual({ '1': false, '2': true, '3': true });
    expect(normalized.playable).toEqual({ '1': true, '2': false, '3': true });
  });

  test('getPlayableVoiceKeys respects playable flags', function() {
    setVoiceViewSettings('tune-b', {
      visible: { '1': true, '2': true },
      playable: { '1': true, '2': false },
    }, ['1', '2']);
    expect(getPlayableVoiceKeys('tune-b', ['1', '2'])).toEqual(['1']);
  });

  test('getPlaybackVoiceKeys requires visible and playable', function() {
    setVoiceViewSettings('tune-c', {
      visible: { '1': true, '2': false },
      playable: { '1': true, '2': true },
    }, ['1', '2']);
    expect(getPlaybackVoiceKeys('tune-c', ['1', '2'])).toEqual(['1']);
  });

  test('hasFilteredPlaybackVoices is false for a single voice', function() {
    expect(hasFilteredPlaybackVoices({
      id: 't1',
      voices: { '1': { notes: [] } },
    })).toBe(false);
  });

  test('hasFilteredPlaybackVoices is true when a voice is hidden', function() {
    setVoiceViewSettings('tune-d', {
      visible: { '1': false, '2': true },
      playable: { '1': false, '2': true },
    }, ['1', '2']);
    expect(hasFilteredPlaybackVoices({
      id: 'tune-d',
      voices: { '1': { notes: [] }, '2': { notes: [] } },
    })).toBe(true);
  });
});
