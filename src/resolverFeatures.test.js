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
      features: { proxy: true, stems: false, whisper: true, llm: false, oauthBff: true, soundfonts: true },
    })).toEqual({
      proxy: true,
      stems: false,
      whisper: true,
      llm: false,
      practiceAnalysis: false,
      oauthBff: true,
      soundfonts: true,
      sheetImage: false,
      sheetImageOcr: false,
      sheetImageOmr: false,
      lightMode: false,
      youtubeAudio: false,
      youtubeEgressRequired: false,
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
      features: { proxy: true, stems: false, whisper: true, llm: true, oauthBff: false, soundfonts: true },
    };
    expect(resolverHasFeature(status, 'proxy')).toBe(true);
    expect(resolverHasFeature(status, 'stems')).toBe(false);
    expect(resolverHasFeature(status, 'soundfonts')).toBe(true);
  });

  test('normalizeResolverFeatures ignores unknown keys', function() {
    expect(normalizeResolverFeatures({ proxy: 1, stems: 'yes', extra: true }))
      .toEqual(DEFAULT_RESOLVER_FEATURES);
  });
});
