import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { applyPlaybackSettingsOffline } from './processedMediaExport';
import { audioFiltersAreNeutral } from './pitchTempoUtils';

/**
 * Build a pre-rendered audio blob for native HTML5 / ExoPlayer playback.
 * Used on mobile and in the Android app to avoid Web Audio background suspension.
 */
export async function buildNativePlaybackBlob(cacheOptions, settings, options) {
  const opts = options || {};
  const filtersActive = !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters));
  const pitchActive = settings.pitch !== 0 || settings.fineTune !== 0;
  const tempoActive = settings.tempo > 0 && Math.abs(settings.tempo - 1) > 0.0001;
  const needsProcessing = filtersActive || pitchActive || tempoActive;

  if (!needsProcessing) {
    throw new Error('No playback processing requested');
  }

  if (filtersActive) {
    const { buildFilteredMediaBlob } = await import('./nativeFilteredMedia');
    const built = await buildFilteredMediaBlob(cacheOptions, settings.audioFilters, opts);
    if (!pitchActive && !tempoActive) {
      return {
        blob: built.blob,
        duration: built.duration,
        separation: built.separation,
      };
    }
    const processed = await applyPlaybackSettingsOffline(
      await decodeAudioBufferFromWav(await built.blob.arrayBuffer()),
      settings
    );
    return {
      blob: encodeAudioBufferToWav(processed),
      duration: processed.duration,
      separation: built.separation,
    };
  }

  const decoded = await fetchAndDecodeExternalMedia(
    cacheOptions.src,
    cacheOptions.srcType,
    cacheOptions.youtubeGetId,
    cacheOptions.accessToken
  );
  const processed = await applyPlaybackSettingsOffline(decoded.audioBuffer, settings);
  return {
    blob: encodeAudioBufferToWav(processed),
    duration: processed.duration,
    separation: null,
  };
}

async function decodeAudioBufferFromWav(arrayBuffer) {
  const AudioContextClass = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null;
  if (!AudioContextClass) {
    throw new Error('AudioContext is not available');
  }
  const ctx = new AudioContextClass();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
      ctx.close().catch(function() {});
    }
  }
}
