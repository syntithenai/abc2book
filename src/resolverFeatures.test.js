import {
  AI_FEATURE_KEYS,
  ALL_RESOLVER_FEATURES,
  DEFAULT_RESOLVER_FEATURES,
  applyAiFeatureGate,
  getResolverFeaturesFromStatus,
  isAiEnabled,
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
      ai: false,
      proxy: true,
      stems: false,
      whisper: false,
      llm: false,
      practiceAnalysis: false,
      oauthBff: true,
      soundfonts: true,
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
      ai: false,
      proxy: true,
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
      castPlayback: false,
      midiRender: false,
      midiConvert: false,
      midiImport: false,
      scoreConvert: false,
      tts: false,
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

  test('AI capabilities stay off unless features.ai is explicitly true', function() {
    const legacy = normalizeResolverFeatures({ proxy: true, whisper: true, stems: true, tts: true });
    expect(legacy.ai).toBe(false);
    expect(legacy.whisper).toBe(false);
    expect(legacy.stems).toBe(false);
    expect(legacy.tts).toBe(false);
    expect(legacy.proxy).toBe(true);

    const enabled = normalizeResolverFeatures({ ai: true, proxy: true, whisper: true, stems: true, tts: true });
    expect(enabled.ai).toBe(true);
    expect(enabled.whisper).toBe(true);
    expect(enabled.stems).toBe(true);
    expect(enabled.tts).toBe(true);
  });

  test('isAiEnabled and applyAiFeatureGate enforce the central switch', function() {
    expect(isAiEnabled({ ai: true })).toBe(true);
    expect(isAiEnabled({ ai: false })).toBe(false);
    expect(isAiEnabled(null)).toBe(false);
    const gated = applyAiFeatureGate({ ai: false, proxy: true, llm: true, practiceTrack: true });
    expect(gated.proxy).toBe(true);
    expect(gated.llm).toBe(false);
    expect(gated.practiceTrack).toBe(false);
  });

  test('legacy fallback never re-enables AI', function() {
    expect(ALL_RESOLVER_FEATURES.ai).toBe(false);
    AI_FEATURE_KEYS.forEach(function(key) {
      expect(ALL_RESOLVER_FEATURES[key]).toBe(false);
    });
    expect(ALL_RESOLVER_FEATURES.proxy).toBe(true);
  });
});
