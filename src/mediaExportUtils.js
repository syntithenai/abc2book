import { getMediaPlaybackSettings, audioFiltersAreNeutral, playbackNeedsExternalProcessing } from './pitchTempoUtils'
import { applyPlaybackSettingsOffline } from './processedMediaExport'
import { mixStemBuffersOffline, loadStemBuffersForSource } from './nativeFilteredMedia'
import { getExternalMediaMp3Blob } from './externalMediaAudioCache'
import { encodeAudioBuffer } from './audioCompressEncode'
import { getAudioCompressFormat, getAudioCompressExtension, normalizeAudioCompressFormat } from './audioCompressSettings'
import { sanitizeDownloadFilename } from './tuneDownloadActions'
import { offerBlobDownload } from './offerBlobDownload'
import { trimAudioBuffer, getLinkTrimBounds } from './mediaAudioTrim'

async function decodeCachedAudio(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const { decodeAudioBytes } = await import('./audioDecodeBytes')
  return decodeAudioBytes(arrayBuffer)
}

function normalizeAudioFormat(audioFormat) {
  if (audioFormat === null || audioFormat === undefined || audioFormat === '') {
    return getAudioCompressFormat()
  }
  return normalizeAudioCompressFormat(audioFormat)
}

async function encodeBufferForExport(buffer, audioFormat, options) {
  const opts = options || {}
  const requested = normalizeAudioFormat(audioFormat)
  const formats = []
  if (opts.preferFastOfflineEncode && requested === 'aac') {
    formats.push('mp3')
  }
  if (formats.indexOf(requested) === -1) formats.push(requested)
  if (formats.indexOf('mp3') === -1) formats.push('mp3')
  if (formats.indexOf('wav') === -1) formats.push('wav')
  for (let i = 0; i < formats.length; i += 1) {
    const encoded = await encodeAudioBuffer(buffer, formats[i])
    if (encoded && encoded.blob && encoded.blob.size > 0) {
      return encoded
    }
  }
  throw new Error('Could not encode audio for export')
}

function assertExportBlob(blob, message) {
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
    throw new Error(message || 'Export produced an empty file')
  }
  return blob
}

export function buildTuneMediaExportFilename(tune, linkIndex, options) {
  const opts = options || {}
  const safeName = sanitizeDownloadFilename(tune && tune.name, 'tune')
  const extension = opts.extension || getAudioCompressExtension(normalizeAudioFormat(opts.audioFormat))
  const linkNum = parseInt(linkIndex, 10) + 1
  if (opts.processed) {
    return safeName + '-link-' + linkNum + '-processed.' + extension
  }
  return safeName + '-link-' + linkNum + '.' + extension
}

function exportNeedsProcessing(settings, link, trim) {
  if (playbackNeedsExternalProcessing(settings)) return true
  if (trim === false) return false
  const bounds = getLinkTrimBounds(link)
  return bounds.startSec > 0 || bounds.endSec > 0
}

async function loadSourceBuffer(options) {
  try {
    const cached = await getExternalMediaMp3Blob({
      tuneId: options.tuneId,
      linkIndex: options.linkIndex,
      src: options.src,
      srcType: options.srcType,
      youtubeGetId: options.youtubeGetId,
      accessToken: options.accessToken,
    })
    if (!cached || !cached.blob) {
      throw new Error('Could not load audio for export')
    }
    return decodeCachedAudio(cached.blob)
  } catch (error) {
    const detail = error && error.message ? String(error.message).trim() : ''
    if (detail && detail !== 'Could not load audio for export') {
      throw new Error('Could not load audio for export: ' + detail)
    }
    throw error
  }
}

async function buildStemMixExportBlob(cacheOptions, settings, options) {
  const audioFormat = normalizeAudioFormat(options.audioFormat)
  const trim = options.trim !== false
  const bounds = trim ? options.trimBounds : { startSec: 0, endSec: 0 }
  const allowNetworkSeparation = options.allowNetworkSeparation !== false

  const loaded = await loadStemBuffersForSource(cacheOptions, {
    allowNetworkSeparation: allowNetworkSeparation,
    signal: options.signal,
    onProgress: function(message, progress) {
      if (typeof options.onProgress === 'function') {
        options.onProgress(message || 'Loading stems...', progress)
      }
    },
    onStatus: options.onStatus,
  })
  if (!loaded || !loaded.stemBuffers) {
    throw new Error(allowNetworkSeparation
      ? 'Could not load stems for download'
      : 'Stem filters require analysed stems. Open Media Controls → Audio Filters and click Analyse first.')
  }

  if (typeof options.onProgress === 'function') {
    options.onProgress('Mixing stems...', 70)
  }

  let buffer = mixStemBuffersOffline(loaded.stemBuffers, settings.audioFilters)
  if (!buffer) {
    throw new Error('Stem mix produced no audio')
  }
  if (trim) {
    buffer = trimAudioBuffer(buffer, bounds.startSec, bounds.endSec)
  }
  if (!buffer) {
    throw new Error('Could not trim audio for export')
  }

  const processed = await applyPlaybackSettingsOffline(buffer, settings)
  if (typeof options.onProgress === 'function') {
    options.onProgress('Encoding audio...', 90)
  }
  const encoded = await encodeBufferForExport(processed, audioFormat, {
    preferFastOfflineEncode: options.preferFastOfflineEncode,
  })
  return {
    blob: assertExportBlob(encoded.blob, 'Export produced an empty file'),
    duration: processed.duration,
    audioFormat: encoded.format,
  }
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

  if (options.preferStemMix) {
    return buildStemMixExportBlob(cacheOptions, settings, {
      audioFormat: audioFormat,
      trim: trim,
      trimBounds: bounds,
      allowNetworkSeparation: options.allowNetworkSeparation,
      preferFastOfflineEncode: options.preferFastOfflineEncode,
      signal: options.signal,
      onProgress: options.onProgress,
      onStatus: options.onStatus,
    })
  }

  if (!exportNeedsProcessing(settings, link, trim)) {
    const cached = await getExternalMediaMp3Blob(loadOptions)
    if (!cached || !cached.blob) {
      throw new Error('Could not load audio for export')
    }
    const cachedFormat = cached.audioFormat || null
    // Reuse cache blob when it already matches the requested export format.
    if (cachedFormat === audioFormat || (!cachedFormat && audioFormat === 'mp3')) {
      return {
        blob: assertExportBlob(cached.blob, 'Could not load audio for export'),
        duration: cached.duration || 0,
        fromCache: !!cached.cached,
        audioFormat: audioFormat,
      }
    }
    const buffer = await decodeCachedAudio(cached.blob)
    const encoded = await encodeBufferForExport(buffer, audioFormat)
    return {
      blob: assertExportBlob(encoded.blob, 'Export produced an empty file'),
      duration: cached.duration || buffer.duration || 0,
      fromCache: !!cached.cached,
      audioFormat: encoded.format,
    }
  }

  if (filtersActive) {
    return buildStemMixExportBlob(cacheOptions, settings, {
      audioFormat: audioFormat,
      trim: trim,
      trimBounds: bounds,
      allowNetworkSeparation: options.allowNetworkSeparation !== false,
      signal: options.signal,
      onProgress: options.onProgress,
      onStatus: options.onStatus,
    })
  }

  let buffer = await loadSourceBuffer(loadOptions)

  if (trim) {
    buffer = trimAudioBuffer(buffer, bounds.startSec, bounds.endSec)
  }
  if (!buffer) {
    throw new Error('Could not load audio for export')
  }

  const processed = await applyPlaybackSettingsOffline(buffer, settings)
  const encoded = await encodeBufferForExport(processed, audioFormat)
  return {
    blob: assertExportBlob(encoded.blob, 'Export produced an empty file'),
    duration: processed.duration,
    audioFormat: encoded.format,
  }
}

function resolveExportFilename(filename, audioFormat) {
  if (!filename || !audioFormat) return filename
  const extension = getAudioCompressExtension(audioFormat)
  const base = String(filename).replace(/\.[^.]+$/, '')
  return base + '.' + extension
}

export async function downloadTuneMediaExport(options) {
  const result = await buildTuneMediaExportBlob(options)
  assertExportBlob(result.blob, 'Export produced an empty file')
  const filename = resolveExportFilename(options.filename, result.audioFormat)
  const delivery = await offerBlobDownload(result.blob, filename, {
    tryImmediate: false,
  })
  return Object.assign({}, result, { delivery: delivery })
}
