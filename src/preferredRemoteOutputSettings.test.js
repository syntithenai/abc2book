import {
  PREFERRED_OUTPUT_LOCAL,
  PREFERRED_OUTPUT_SNAPCAST,
  getChromecastOutputEnabled,
  getPreferredRemoteOutput,
  getSnapcastAutoConnect,
  getSnapcastFallbackToLocal,
  getSnapcastOutputEnabled,
  getSnapcastYoutubeAcknowledged,
  isRemoteOutputEnabled,
  isSnapcastPreferredOutput,
  setChromecastOutputEnabled,
  setPreferredRemoteOutput,
  setRemoteOutputEnabled,
  setSnapcastAutoConnect,
  setSnapcastFallbackToLocal,
  setSnapcastOutputEnabled,
  setSnapcastYoutubeAcknowledged,
} from './preferredRemoteOutputSettings';

describe('preferredRemoteOutputSettings', function() {
  const originalEnv = process.env.REACT_APP_REMOTE_OUTPUT_UI;

  beforeEach(function() {
    process.env.REACT_APP_REMOTE_OUTPUT_UI = 'true';
    localStorage.clear();
  });

  afterEach(function() {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_REMOTE_OUTPUT_UI;
    } else {
      process.env.REACT_APP_REMOTE_OUTPUT_UI = originalEnv;
    }
  });

  test('defaults to local output', function() {
    expect(getPreferredRemoteOutput()).toBe(PREFERRED_OUTPUT_LOCAL);
    expect(isSnapcastPreferredOutput()).toBe(false);
  });

  test('persists snapcast preference', function() {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
    expect(getPreferredRemoteOutput()).toBe(PREFERRED_OUTPUT_SNAPCAST);
    expect(isSnapcastPreferredOutput()).toBe(true);
    setPreferredRemoteOutput(PREFERRED_OUTPUT_LOCAL);
    expect(isSnapcastPreferredOutput()).toBe(false);
  });

  test('youtube acknowledgement', function() {
    expect(getSnapcastYoutubeAcknowledged()).toBe(false);
    setSnapcastYoutubeAcknowledged(true);
    expect(getSnapcastYoutubeAcknowledged()).toBe(true);
  });

  test('auto connect defaults true', function() {
    expect(getSnapcastAutoConnect()).toBe(true);
    setSnapcastAutoConnect(false);
    expect(getSnapcastAutoConnect()).toBe(false);
  });

  test('fallback to local defaults true', function() {
    expect(getSnapcastFallbackToLocal()).toBe(true);
    setSnapcastFallbackToLocal(false);
    expect(getSnapcastFallbackToLocal()).toBe(false);
  });

  test('remote output toggles default enabled', function() {
    expect(getSnapcastOutputEnabled()).toBe(true);
    expect(getChromecastOutputEnabled()).toBe(true);
    expect(isRemoteOutputEnabled()).toBe(true);
  });

  test('master remote output toggle disables both targets', function() {
    setRemoteOutputEnabled(false);
    expect(getSnapcastOutputEnabled()).toBe(false);
    expect(getChromecastOutputEnabled()).toBe(false);
    expect(isRemoteOutputEnabled()).toBe(false);
  });

  test('disabling snapcast clears snapcast default preference', function() {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
    setSnapcastOutputEnabled(false);
    expect(getPreferredRemoteOutput()).toBe(PREFERRED_OUTPUT_LOCAL);
    expect(isSnapcastPreferredOutput()).toBe(false);
  });

  test('snapcast default ignored when snapcast output is disabled', function() {
    localStorage.setItem('bookstorage_preferred_remote_output', PREFERRED_OUTPUT_SNAPCAST);
    localStorage.setItem('bookstorage_snapcast_output_enabled', '0');
    expect(isSnapcastPreferredOutput()).toBe(false);
  });
});
