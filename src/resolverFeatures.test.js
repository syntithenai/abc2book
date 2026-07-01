import {
  ALL_RESOLVER_FEATURES,
  DEFAULT_RESOLVER_FEATURES,
  getResolverFeaturesFromStatus,
  normalizeResolverFeatures,
  parseResolverFeaturesFromHealthBody,
  resolverHasFeature,
} from './resolverFeatures';

describe('resolverFeatures', function() {
  test('parseResolverFeaturesFromHealthBody reads granular features', function() {
    expect(parseResolverFeaturesFromHealthBody({
      ok: true,
      features: { proxy: true, stems: false, whisper: true, llm: false },
    })).toEqual({
      proxy: true,
      stems: false,
      whisper: true,
      llm: false,
    });
  });

  test('parseResolverFeaturesFromHealthBody falls back for legacy health bodies', function() {
    expect(parseResolverFeaturesFromHealthBody({ ok: true })).toEqual(ALL_RESOLVER_FEATURES);
  });

  test('getResolverFeaturesFromStatus returns defaults when resolver unavailable', function() {
    expect(getResolverFeaturesFromStatus({ available: false, features: ALL_RESOLVER_FEATURES }))
      .toEqual(DEFAULT_RESOLVER_FEATURES);
  });

  test('resolverHasFeature checks a single capability', function() {
    const status = {
      available: true,
      features: { proxy: true, stems: false, whisper: true, llm: true },
    };
    expect(resolverHasFeature(status, 'proxy')).toBe(true);
    expect(resolverHasFeature(status, 'stems')).toBe(false);
  });

  test('normalizeResolverFeatures ignores unknown keys', function() {
    expect(normalizeResolverFeatures({ proxy: 1, stems: 'yes', extra: true }))
      .toEqual(DEFAULT_RESOLVER_FEATURES);
  });
});
