export const DEFAULT_RESOLVER_FEATURES = Object.freeze({
  proxy: false,
  stems: false,
  whisper: false,
  llm: false,
  practiceAnalysis: false,
});

export const ALL_RESOLVER_FEATURES = Object.freeze({
  proxy: true,
  stems: true,
  whisper: true,
  llm: true,
  practiceAnalysis: true,
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
  if (!status || !status.available) {
    return Object.assign({}, DEFAULT_RESOLVER_FEATURES);
  }
  if (status.features) {
    return normalizeResolverFeatures(status.features, { fallback: false });
  }
  return Object.assign({}, ALL_RESOLVER_FEATURES);
}

export function resolverHasFeature(status, feature) {
  const features = getResolverFeaturesFromStatus(status);
  return features[feature] === true;
}
