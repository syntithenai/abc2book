/**
 * Maps a plain controller snapshot to playbackRouter context input.
 */

export const PLAYBACK_ROUTE_PHASE = {
  prePlay: 'prePlay',
  postSnapcastAttempt: 'postSnapcastAttempt',
  postDispatch: 'postDispatch',
};

/**
 * @param {object} snapshot
 * @returns {object} context for resolvePlaybackRoute
 */
export function buildPlaybackRouterContext(snapshot) {
  const s = snapshot || {};
  const routeMode = s.routeMode || 'none';
  const srcType = s.srcType || 'empty';
  const src = s.src != null ? String(s.src) : '';

  return {
    tune: s.tune || null,
    srcType: srcType,
    src: src,
    isMidiPlaybackRoute: routeMode === 'midi',
    isMidiFileMediaRoute: !!s.isMidiFileMediaRoute,
    needsExternalProcessing: !!s.needsExternalProcessing,
    canUseNativeFiltered: !!s.canUseNativeFiltered,
    cachedBlobAvailable: s.cachedBlobAvailable === true,
    remoteOutputActive: !!s.remoteOutputActive,
    androidYoutubeNative: !!s.androidYoutubeNative,
    mediaResolverAvailable: !!s.mediaResolverAvailable,
  };
}

/**
 * Build a snapshot object from controller fields (call once per play()).
 */
export function capturePlaybackSnapshot(fields) {
  const f = fields || {};
  return {
    tune: f.tune || null,
    tuneId: f.tune && f.tune.id ? f.tune.id : null,
    routeMode: f.routeMode || 'none',
    linkIndex: f.linkIndex != null ? f.linkIndex : null,
    src: f.src != null ? f.src : '',
    srcType: f.srcType || 'empty',
    isMidiFileMediaRoute: !!f.isMidiFileMediaRoute,
    needsExternalProcessing: !!f.needsExternalProcessing,
    canUseNativeFiltered: !!f.canUseNativeFiltered,
    cachedBlobAvailable: f.cachedBlobAvailable === true,
    remoteOutputActive: !!f.remoteOutputActive,
    androidYoutubeNative: !!f.androidYoutubeNative,
    mediaResolverAvailable: !!f.mediaResolverAvailable,
    userPaused: !!f.userPaused,
    snapcastRemoteActive: !!f.snapcastRemoteActive,
    castRemoteActive: !!f.castRemoteActive,
    isPlaying: !!f.isPlaying,
    hasActiveOutput: !!f.hasActiveOutput,
    prefersNative: !!f.prefersNative,
    playOpts: f.playOpts || {},
  };
}
