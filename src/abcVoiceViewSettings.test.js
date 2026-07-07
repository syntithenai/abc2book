import {
  defaultVoiceViewSettings,
  getVoiceViewSettings,
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
});
