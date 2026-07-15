import {
  AUDIO_COMPRESS_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_COMPRESS_SETTINGS,
  getAudioCompressExtension,
  getAudioCompressFormat,
  getAudioCompressMimeType,
  loadAudioCompressSettings,
  normalizeAudioCompressFormat,
  normalizeAudioCompressSettings,
  saveAudioCompressSettings,
} from './audioCompressSettings';

describe('audioCompressSettings', function() {
  beforeEach(function() {
    localStorage.removeItem(AUDIO_COMPRESS_SETTINGS_STORAGE_KEY);
  });

  test('defaults to aac', function() {
    expect(DEFAULT_AUDIO_COMPRESS_SETTINGS.format).toBe('aac');
    expect(loadAudioCompressSettings()).toEqual({ format: 'aac' });
    expect(getAudioCompressFormat()).toBe('aac');
  });

  test('normalizes invalid formats to aac', function() {
    expect(normalizeAudioCompressFormat('flac')).toBe('aac');
    expect(normalizeAudioCompressSettings({ format: 'ogg' })).toEqual({ format: 'aac' });
  });

  test('persists and loads format', function() {
    expect(saveAudioCompressSettings({ format: 'wav' })).toEqual({ format: 'wav' });
    expect(loadAudioCompressSettings()).toEqual({ format: 'wav' });
    expect(getAudioCompressFormat()).toBe('wav');
  });

  test('maps mime and extension', function() {
    expect(getAudioCompressMimeType('wav')).toBe('audio/wav');
    expect(getAudioCompressMimeType('mp3')).toBe('audio/mpeg');
    expect(getAudioCompressMimeType('aac')).toBe('audio/mp4');
    expect(getAudioCompressExtension('wav')).toBe('wav');
    expect(getAudioCompressExtension('mp3')).toBe('mp3');
    expect(getAudioCompressExtension('aac')).toBe('m4a');
  });
});
