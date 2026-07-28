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
      musicCollection: false,
      bandcamp: false,
      internetArchive: false,
      europeana: false,
      locAudio: false,
      practiceTrack: false,
      snapcastControl: false,
      snapcastPlayback: false,
    });
  });

  test('parseResolverFeaturesFromHealthBody falls back for legacy health bodies', function() {
    expect(parseResolverFeaturesFromHealthBody({ ok: true })).toEqual(ALL_RESOLVER_FEATURES);
  });

  test('getResolverFeaturesFromStatus uses reachable candidate when active resolver unavailable', function() {
    expect(getResolverFeaturesFromStatus({
      available: false,
      features: { proxy: true, stems: false, whisper: true, llm: true, lightMode: true, youtubeEgressRequired: true },
      candidates: [{
        base: 'https://resolver.example',
        reachable: true,
        available: false,
        features: { proxy: true, stems: false, whisper: true, llm: true, lightMode: true, youtubeEgressRequired: true },
      }],
    })).toEqual({
      proxy: true,
      stems: false,
      whisper: true,
      llm: true,
      practiceAnalysis: false,
      oauthBff: false,
      soundfonts: false,
      sheetImage: false,
      sheetImageOcr: false,
      sheetImageOmr: false,
      lightMode: true,
      youtubeAudio: false,
      youtubeEgressRequired: true,
      musicCollection: false,
      bandcamp: false,
      internetArchive: false,
      europeana: false,
      locAudio: false,
      practiceTrack: false,
      snapcastControl: false,
      snapcastPlayback: false,
    });
  });

  test('getResolverFeaturesFromStatus returns defaults when no reachable candidates', function() {
    expect(getResolverFeaturesFromStatus({ available: false, candidates: [] }))
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
