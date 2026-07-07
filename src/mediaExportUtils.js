import { getMediaPlaybackSettings, audioFiltersAreNeutral, playbackNeedsExternalProcessing } from './pitchTempoUtils'
import { applyPlaybackSettingsOffline } from './processedMediaExport'
import { mixStemBuffersOffline, loadStemBuffersForSource, encodeAudioBufferToWav } from './nativeFilteredMedia'
import { getExternalMediaMp3Blob } from './externalMediaAudioCache'
import MP3Converter from './MP3Converter'
import { triggerBlobDownload } from './processedMediaExport'
import { trimAudioBuffer, getLinkTrimBounds } from './mediaAudioTrim'

async function decodeCachedMp3(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const decodeModule = await import('audio-decode')
  const decode = decodeModule.default || decodeModule
  return decode(arrayBuffer)
}

function normalizeAudioFormat(audioFormat) {
  return audioFormat === 'wav' ? 'wav' : 'mp3'
}

async function encodeBufferForExport(buffer, audioFormat) {
  if (normalizeAudioFormat(audioFormat) === 'wav') {
    return encodeAudioBufferToWav(buffer)
  }
  const converter = new MP3Converter()
  return converter.convertAudioBuffer(buffer, { bitRate: 96 })
}

function exportNeedsProcessing(settings, link, trim) {
  if (playbackNeedsExternalProcessing(settings)) return true
  if (trim === false) return false
  const bounds = getLinkTrimBounds(link)
  return bounds.startSec > 0 || bounds.endSec > 0
}

async function loadSourceBuffer(options) {
  const mp3 = await getExternalMediaMp3Blob({
    tuneId: options.tuneId,
    linkIndex: options.linkIndex,
    src: options.src,
    srcType: options.srcType,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.accessToken,
  })
  if (!mp3 || !mp3.blob) {
    throw new Error('Could not load audio for export')
  }
  return decodeCachedMp3(mp3.blob)
}

export async function buildTuneMediaExportBlob(options) {
  const tune = options.tune
  const linkIndex = options.linkIndex
  const link = tune && tune.links ? tune.links[linkIndex] : null
  if (!tune || !link || !link.link) {
    throw new Error('No media link available')
  }

  const src = link.link
  const srcType = options.srcType
  const settings = options.settings || getMediaPlaybackSettings(tune)
  const trim = options.trim !== false
  const audioFormat = normalizeAudioFormat(options.audioFormat)
  const bounds = trim ? getLinkTrimBounds(link) : { startSec: 0, endSec: 0 }
  const loadOptions = {
    tuneId: tune.id,
    linkIndex: linkIndex,
    src: src,
    srcType: srcType,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.accessToken,
  }

  if (!exportNeedsProcessing(settings, link, trim)) {
    const mp3 = await getExternalMediaMp3Blob(loadOptions)
    if (!mp3 || !mp3.blob) {
      throw new Error('Could not load audio for export')
    }
    if (audioFormat === 'mp3') {
      return {
        blob: mp3.blob,
        duration: mp3.duration || 0,
        fromCache: !!mp3.cached,
      }
    }
    const buffer = await decodeCachedMp3(mp3.blob)
    return {
      blob: encodeAudioBufferToWav(buffer),
      duration: mp3.duration || buffer.duration || 0,
      fromCache: !!mp3.cached,
    }
  }

  let buffer = await loadSourceBuffer(loadOptions)

  if (trim) {
    buffer = trimAudioBuffer(buffer, bounds.startSec, bounds.endSec)
  }
  if (!buffer) {
    throw new Error('Could not load audio for export')
  }

  const cacheOptions = {
    tuneId: tune.id,
    linkIndex: linkIndex,
    src: src,
    srcType: srcType,
    label: link.title || '',
    accessToken: options.accessToken,
    demucsModel: options.demucsModel || '',
  }

  const filtersActive = settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters)
  if (filtersActive) {
    const loaded = await loadStemBuffersForSource(cacheOptions, {
      allowNetworkSeparation: true,
      signal: options.signal,
      onProgress: options.onProgress,
      onStatus: options.onStatus,
    })
    if (!loaded || !loaded.stemBuffers) {
      throw new Error('Could not separate stems for download with audio filters applied')
    }
    const mixed = mixStemBuffersOffline(loaded.stemBuffers, settings.audioFilters)
    if (!mixed) {
      throw new Error('Stem mix produced no audio')
    }
    buffer = mixed
  }

  const processed = await applyPlaybackSettingsOffline(buffer, settings)
  const blob = await encodeBufferForExport(processed, audioFormat)
  return {
    blob: blob,
    duration: processed.duration,
  }
}

export async function downloadTuneMediaExport(options) {
  const result = await buildTuneMediaExportBlob(options)
  triggerBlobDownload(result.blob, options.filename)
  return result
}
