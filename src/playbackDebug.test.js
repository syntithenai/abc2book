import {
  ensurePlaybackRouteLogBuffer,
  getPlaybackRouteLog,
  logPlaybackRouteDecision,
} from './playbackDebug';

describe('playbackDebug route log', function() {
  beforeEach(function() {
    localStorage.clear();
    delete window.__tunebookPlaybackRouteLog;
    delete window.__tunebookPlaybackRouteLogEnabled;
    delete window.__tunebookPlaybackDebug;
  });

  afterEach(function() {
    delete window.__tunebookPlaybackRouteLog;
    delete window.__tunebookPlaybackRouteLogEnabled;
    delete window.__tunebookPlaybackDebug;
  });

  test('ensurePlaybackRouteLogBuffer initializes empty array when enabled', function() {
    window.__tunebookPlaybackRouteLogEnabled = true;
    ensurePlaybackRouteLogBuffer();
    expect(window.__tunebookPlaybackRouteLog).toEqual([]);
  });

  test('getPlaybackRouteLog returns empty array when enabled but unset', function() {
    window.__tunebookPlaybackRouteLogEnabled = true;
    expect(getPlaybackRouteLog()).toEqual([]);
    expect(window.__tunebookPlaybackRouteLog).toEqual([]);
  });

  test('logPlaybackRouteDecision writes once without agent debug prefix', function() {
    window.__tunebookPlaybackRouteLogEnabled = true;
    const spy = jest.spyOn(console, 'log').mockImplementation(function() {});
    logPlaybackRouteDecision({
      phase: 'prePlay',
      branch: 'midi-synth',
      context: { src: 'https://secret.example.com/track.mp3?token=abc' },
    });
    expect(window.__tunebookPlaybackRouteLog.length).toBe(1);
    expect(window.__tunebookPlaybackRouteLog[0].context.src).toBe('secret.example.com/track.mp3');
    const routeLogs = spy.mock.calls.filter(function(call) {
      return call[0] === '[tunebook-playback-route]';
    });
    expect(routeLogs.length).toBe(1);
    const agentLogs = spy.mock.calls.filter(function(call) {
      return String(call[0]).indexOf('[DBG-') === 0;
    });
    expect(agentLogs.length).toBe(0);
    spy.mockRestore();
  });
});
