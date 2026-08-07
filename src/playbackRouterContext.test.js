import {
  buildPlaybackRouterContext,
  capturePlaybackSnapshot,
  PLAYBACK_ROUTE_PHASE,
} from './playbackRouterContext';

describe('playbackRouterContext', function() {
  test('buildPlaybackRouterContext maps snapshot fields', function() {
    const ctx = buildPlaybackRouterContext({
      routeMode: 'midi',
      srcType: 'audio',
      src: 'https://example.com/a.mp3',
      isMidiFileMediaRoute: false,
      needsExternalProcessing: true,
      canUseNativeFiltered: true,
      cachedBlobAvailable: true,
      remoteOutputActive: false,
      androidYoutubeNative: true,
      mediaResolverAvailable: true,
    });
    expect(ctx.isMidiPlaybackRoute).toBe(true);
    expect(ctx.srcType).toBe('audio');
    expect(ctx.needsExternalProcessing).toBe(true);
    expect(ctx.canUseNativeFiltered).toBe(true);
    expect(ctx.cachedBlobAvailable).toBe(true);
    expect(ctx.androidYoutubeNative).toBe(true);
  });

  test('capturePlaybackSnapshot freezes play state', function() {
    const snap = capturePlaybackSnapshot({
      routeMode: 'media',
      srcType: 'youtube',
      userPaused: true,
      playOpts: { fresh: true },
    });
    expect(snap.routeMode).toBe('media');
    expect(snap.userPaused).toBe(true);
    expect(snap.playOpts.fresh).toBe(true);
  });

  test('PLAYBACK_ROUTE_PHASE values', function() {
    expect(PLAYBACK_ROUTE_PHASE.prePlay).toBe('prePlay');
    expect(PLAYBACK_ROUTE_PHASE.postSnapcastAttempt).toBe('postSnapcastAttempt');
    expect(PLAYBACK_ROUTE_PHASE.postDispatch).toBe('postDispatch');
  });
});
