export const DEFAULT_RESOLVER_FEATURES = Object.freeze({
  proxy: false,
  stems: false,
  whisper: false,
  llm: false,
  practiceAnalysis: false,
  oauthBff: false,
  soundfonts: false,
  sheetImage: false,
  sheetImageOcr: false,
  sheetImageOmr: false,
  lightMode: false,
  youtubeAudio: false,
  youtubeEgressRequired: false,
  musicCollection: false,
  bandcamp: false,
  internetArchive: false,
  europeana: false,
  locAudio: false,
  practiceTrack: false,
  snapcastControl: false,
  snapcastPlayback: false,
  castPlayback: false,
  midiRender: false,
});

export const ALL_RESOLVER_FEATURES = Object.freeze({
  proxy: true,
  stems: true,
  whisper: true,
  llm: true,
  practiceAnalysis: true,
  // Legacy health bodies without features do not imply OAuth BFF.
  oauthBff: false,
  // Legacy resolvers without soundfont download still serve embedded selection.
  soundfonts: true,
  sheetImage: true,
  sheetImageOcr: true,
  sheetImageOmr: true,
  lightMode: false,
  youtubeAudio: true,
  youtubeEgressRequired: false,
  musicCollection: false,
  bandcamp: true,
  internetArchive: true,
  europeana: true,
  locAudio: true,
  practiceTrack: true,
  snapcastControl: false,
  snapcastPlayback: false,
  castPlayback: false,
  midiRender: false,
});

export function normalizeResolverFeatures(raw, options) {
  const opts = options || {};
  const fallback = opts.fallback === true;
  if (!raw || typeof raw !== 'object') {
    return fallback
      ? Object.assign({}, ALL_RESOLVER_FEATURES)
      : Object.assign({}, DEFAULT_RESOLVER_FEATURES);
  }
  return {
    proxy: raw.proxy === true,
    stems: raw.stems === true,
    whisper: raw.whisper === true,
    llm: raw.llm === true,
    practiceAnalysis: raw.practiceAnalysis === true,
    oauthBff: raw.oauthBff === true,
    soundfonts: raw.soundfonts === true,
    sheetImage: raw.sheetImage === true,
    sheetImageOcr: raw.sheetImageOcr === true,
    sheetImageOmr: raw.sheetImageOmr === true,
    lightMode: raw.lightMode === true,
    youtubeAudio: raw.youtubeAudio === true,
    youtubeEgressRequired: raw.youtubeEgressRequired === true,
    musicCollection: raw.musicCollection === true,
    bandcamp: raw.bandcamp === true,
    internetArchive: raw.internetArchive === true,
    europeana: raw.europeana === true,
    locAudio: raw.locAudio === true,
    practiceTrack: raw.practiceTrack === true,
    snapcastControl: raw.snapcastControl === true,
    snapcastPlayback: raw.snapcastPlayback === true,
    castPlayback: raw.castPlayback === true,
    midiRender: raw.midiRender === true,
  };
}

export function parseResolverFeaturesFromHealthBody(body) {
  if (!body || !body.ok) {
    return Object.assign({}, DEFAULT_RESOLVER_FEATURES);
  }
  if (body.features) {
    return normalizeResolverFeatures(body.features, { fallback: false });
  }
  // Older resolvers without granular features: assume all capabilities.
  return Object.assign({}, ALL_RESOLVER_FEATURES);
}

export function getResolverFeaturesFromStatus(status) {
  if (!status) {
    return Object.assign({}, DEFAULT_RESOLVER_FEATURES);
  }
  if (status.available && status.features) {
    return normalizeResolverFeatures(status.features, { fallback: false });
  }
  const candidates = status.candidates || [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.reachable && candidate.features) {
      return normalizeResolverFeatures(candidate.features, { fallback: false });
    }
  }
  if (status.features) {
    return normalizeResolverFeatures(status.features, { fallback: false });
  }
  return Object.assign({}, DEFAULT_RESOLVER_FEATURES);
}

export function resolverHasFeature(status, feature) {
  const features = getResolverFeaturesFromStatus(status);
  return features[feature] === true;
}
