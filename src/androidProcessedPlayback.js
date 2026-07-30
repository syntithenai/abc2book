/**
 * Unified Android pre-render → ExoPlayer pipeline for pitch/tempo/filters.
 */
import { buildNativePlaybackBlob } from './nativePlaybackBlob'
import { playAndroidNativeBlob } from './androidNativePlayback'
import { applyPlaybackSettingsOffline } from './processedMediaExport'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'
import { logPlaybackDebug } from './playbackDebug'

async function decodeBlobToAudioBuffer(blob) {
  const AudioContextClass = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null
  if (!AudioContextClass) {
    throw new Error('AudioContext is not available')
  }
  const ctx = new AudioContextClass()
  try {
    const arrayBuffer = await blob.arrayBuffer()
    return await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
      ctx.close().catch(function() {})
    }
  }
}

export async function startAndroidProcessedPlayback(params) {
  const cacheOptions = params.cacheOptions
  const settings = params.settings
  const metadata = params.metadata || {}
  const resumeAt = params.resumeAt || 0
  const play = params.play !== false
  const onProgress = params.onProgress

  logPlaybackDebug('prerender-native', {
    tuneId: cacheOptions && cacheOptions.tuneId,
    srcType: cacheOptions && cacheOptions.srcType,
  })

  const built = await buildNativePlaybackBlob(cacheOptions, settings, {
    allowNetworkSeparation: true,
    onProgress: onProgress,
  })

  await playAndroidNativeBlob(built.blob, {
    title: metadata.title || 'Tunebook',
    artist: metadata.artist || '',
    positionSec: resumeAt,
    tempo: settings.tempo,
    play: play,
  })

  return {
    blob: built.blob,
    duration: built.duration,
    separation: built.separation,
  }
}

export async function startAndroidProcessedBlobPlayback(params) {
  const sourceBlob = params.sourceBlob
  const settings = params.settings
  const metadata = params.metadata || {}
  const resumeAt = params.resumeAt || 0
  const play = params.play !== false

  logPlaybackDebug('prerender-native-blob', { title: metadata.title })

  const decoded = await decodeBlobToAudioBuffer(sourceBlob)
  const processed = await applyPlaybackSettingsOffline(decoded, settings)
  const wavBlob = encodeAudioBufferToWav(processed)

  await playAndroidNativeBlob(wavBlob, {
    title: metadata.title || 'Tunebook',
    artist: metadata.artist || '',
    positionSec: resumeAt,
    tempo: settings.tempo,
    play: play,
  })

  return {
    blob: wavBlob,
    duration: processed.duration,
    separation: null,
  }
}
