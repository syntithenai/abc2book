import {
  PLAYBACK_ROUTE_PHASE,
  recordPlaybackRouteParity,
} from './playbackRouterRecord';

describe('playbackRouterRecord', function() {
  beforeEach(function() {
    localStorage.clear();
    window.__tunebookPlaybackRouteLog = [];
    window.__tunebookPlaybackRouteLogEnabled = true;
  });

  afterEach(function() {
    delete window.__tunebookPlaybackRouteLogEnabled;
    window.__tunebookPlaybackRouteLog = [];
  });

  test('recordPlaybackRouteParity writes to ring buffer', function() {
    const entry = recordPlaybackRouteParity({
      phase: PLAYBACK_ROUTE_PHASE.prePlay,
      snapshot: {
        routeMode: 'midi',
        srcType: 'empty',
        prefersNative: false,
      },
      branch: 'midi-synth',
    });
    expect(entry).toBeTruthy();
    expect(window.__tunebookPlaybackRouteLog.length).toBe(1);
    expect(window.__tunebookPlaybackRouteLog[0].branch).toBe('midi-synth');
  });

  test('no-op when route log disabled', function() {
    delete window.__tunebookPlaybackRouteLogEnabled;
    localStorage.removeItem('tunebook_playback_debug');
    const entry = recordPlaybackRouteParity({
      phase: PLAYBACK_ROUTE_PHASE.prePlay,
      snapshot: { routeMode: 'midi' },
    });
    expect(entry).toBe(null);
    expect(window.__tunebookPlaybackRouteLog.length).toBe(0);
  });
});
