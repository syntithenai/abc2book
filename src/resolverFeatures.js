// Capabilities that depend on a language/vision/audio model anywhere in the stack.
// Kept in sync with local-resolver/ai_features.py.
export const AI_FEATURE_KEYS = Object.freeze([
  'stems',
  'whisper',
  'llm',
  'practiceAnalysis',
  'sheetImage',
  'sheetImageOcr',
  'sheetImageOmr',
  'sheetImageSplit',
  'practiceTrack',
  'tts',
]);

export const DEFAULT_RESOLVER_FEATURES = Object.freeze({
  ai: false,
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
  sheetImageSplit: false,
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
  midiConvert: false,
  midiImport: false,
  scoreConvert: false,
  tts: false,
});

// Legacy health bodies (no `features` map) fail closed for AI capabilities:
// the central kill switch must never be re-enabled by a missing payload field.
export const ALL_RESOLVER_FEATURES = Object.freeze({
  ai: false,
  proxy: true,
  stems: false,
  whisper: false,
  llm: false,
  practiceAnalysis: false,
  // Legacy health bodies without features do not imply OAuth BFF.
  oauthBff: false,
  // Legacy resolvers without soundfont download still serve embedded selection.
  soundfonts: true,
  sheetImage: false,
  sheetImageOcr: false,
  sheetImageOmr: false,
  sheetImageSplit: false,
  lightMode: false,
  youtubeAudio: true,
  youtubeEgressRequired: false,
  musicCollection: false,
  bandcamp: true,
  internetArchive: true,
  europeana: true,
  locAudio: true,
  practiceTrack: false,
  snapcastControl: false,
  snapcastPlayback: false,
  castPlayback: false,
  midiRender: false,
  midiConvert: true,
  midiImport: false,
  scoreConvert: false,
  tts: false,
});

export function isAiEnabled(features) {
  return Boolean(features && features.ai === true);
}

// Force every model-backed capability off unless the server's central switch
// (`features.ai`) is explicitly on. Deterministic capabilities pass through.
export function applyAiFeatureGate(features) {
  const out = Object.assign({}, features);
  if (!isAiEnabled(out)) {
    for (let i = 0; i < AI_FEATURE_KEYS.length; i++) {
      out[AI_FEATURE_KEYS[i]] = false;
    }
  }
  return out;
}

export function normalizeResolverFeatures(raw, options) {
  const opts = options || {};
  const fallback = opts.fallback === true;
  if (!raw || typeof raw !== 'object') {
    return fallback
      ? Object.assign({}, ALL_RESOLVER_FEATURES)
      : Object.assign({}, DEFAULT_RESOLVER_FEATURES);
  }
  return applyAiFeatureGate({
    ai: raw.ai === true,
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
    // Light gateway never splits. Otherwise treat local OCR/OMR as split-capable
    // (covers older health payloads and re-normalize of cached features that
    // previously forced sheetImageSplit:false when the key was absent).
    sheetImageSplit: raw.lightMode === true
      ? false
      : (raw.sheetImageSplit === true
        || raw.sheetImageOcr === true
        || raw.sheetImageOmr === true),
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
    midiConvert: raw.midiConvert === true,
    midiImport: raw.midiImport === true,
    scoreConvert: raw.scoreConvert === true,
    tts: raw.tts === true,
  });
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
