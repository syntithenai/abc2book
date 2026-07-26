import { toast } from 'react-toastify'
import { getScratchpadBlob } from './scratchpadBlobs'
import { createScratchpadItem, blankNotationTune } from './scratchpadStore'
import { transcribeSheetImageFile } from './sheetImageTranscriptionClient'
import { abcTextToCandidates } from './importSourceParse'
import { resolveScratchpadItemAudioBlob } from './scratchpadAudioInsert'
import { discoverChordsFromSource } from './chordDiscoveryClient'
import { formatDiscoveredChords } from './chordDiscoveryFormatter'
import { analyzeMediaFromSource, formatMediaAnalysisForTune } from './mediaAnalysisClient'
import { transcribeLyricsSource } from './lyricsTranscriptionClient'
import { buildMediaAnalysisNotationAbc } from './mediaAnalysisSuggestions'
import { buildAnalysisProcessingPayload, loadMelodyProcessingSettings } from './melodyProcessingSettings'
import { registerLongRunningJob } from './longRunningJobRegistry'
import { showScratchpadExportToast } from './scratchpadExportToast'
import { resolveResolverAccessToken } from './resolverAccessToken'
import { getActiveResolverAccessToken } from './mediaResolverHealthStore'

function resolveAccessToken(token) {
  return resolveResolverAccessToken(token) || getActiveResolverAccessToken() || ''
}

function sourceTitle(item) {
  return String(item && item.title || 'Untitled').trim() || 'Untitled'
}

function imageFileFromBlob(blob, item) {
  const base = sourceTitle(item).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
  const type = (blob && blob.type) || 'image/png'
  const ext = type.indexOf('jpeg') >= 0 ? '.jpg' : '.png'
  return new File([blob], base + ext, { type: type })
}

function audioFileName(item) {
  const base = sourceTitle(item).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'audio'
  return base + '.wav'
}

function notationFromAbcText(abcText, tunebook, title) {
  const text = String(abcText || '').trim()
  if (!text) return null
  const candidates = abcTextToCandidates(text, tunebook, null)
  if (candidates && candidates.length > 0 && candidates[0].tune) {
    const tune = candidates[0].tune
    if (title && !tune.name) tune.name = title
    return tune
  }
  return blankNotationTune(null, title || 'Notation')
}

function analyseJobLabel(item, mode) {
  if (!item) return 'Scratchpad analyse'
  if (item.type === 'image') {
    return mode === 'omr' ? 'Scratchpad image OMR' : 'Scratchpad image OCR'
  }
  if (mode === 'melody') return 'Scratchpad audio melody analysis'
  if (mode === 'lyrics') return 'Scratchpad audio lyrics transcription'
  return 'Scratchpad audio chord analysis'
}

async function createAnalysedItem(options) {
  const opts = options || {}
  try {
    const item = await createScratchpadItem({
      type: opts.type,
      workspaceId: opts.workspaceId,
      title: opts.title,
      textBody: opts.textBody,
      tuneSnapshot: opts.tuneSnapshot,
    })
    showScratchpadExportToast({
      message: opts.successMessage || 'Analysis saved to scratchpad',
      itemId: item.id,
      onOpen: opts.onOpenItem,
    })
    return item
  } catch (e) {
    if (!e || !e.message || e.message.indexOf('cancelled') === -1) {
      toast.error(e && e.message ? e.message : 'Could not save analysis to scratchpad')
    }
    throw e
  }
}

export async function runScratchpadImageAnalyse(item, options) {
  const opts = options || {}
  const mode = opts.mode === 'omr' ? 'omr' : 'ocr'
  const blobKey = item && item.image && item.image.blobKey
  if (!blobKey) throw new Error('Image data is not available')

  const blob = await getScratchpadBlob(blobKey)
  if (!blob || blob.size === 0) throw new Error('Image data is not available')

  const file = imageFileFromBlob(blob, item)
  const accessToken = resolveAccessToken(opts.token)

  const result = await transcribeSheetImageFile({
    file: file,
    accessToken: accessToken,
    signal: opts.signal,
    onProgress: opts.onProgress,
  })

  const baseTitle = sourceTitle(item)
  if (mode === 'ocr') {
    const text = result && result.chordSheet ? String(result.chordSheet.text || '').trim() : ''
    if (!text) {
      throw new Error('No chord chart or lyric text was detected in this image')
    }
    const detectedTitle = result && result.title ? String(result.title).trim() : ''
    return createAnalysedItem({
      type: 'text',
      workspaceId: opts.workspaceId,
      title: detectedTitle || (baseTitle + ' — OCR'),
      textBody: text,
      successMessage: 'OCR text saved to scratchpad',
      onOpenItem: opts.onOpenItem,
    })
  }

  const melodyAbc = result && result.melody ? String(result.melody.abc || '').trim() : ''
  if (!melodyAbc) {
    throw new Error('No melody notation was detected in this image')
  }
  const detectedTitle = result && result.title ? String(result.title).trim() : ''
  const tuneSnapshot = notationFromAbcText(
    melodyAbc,
    opts.tunebook,
    detectedTitle || (baseTitle + ' — notation')
  )
  if (!tuneSnapshot) {
    throw new Error('Could not convert melody to notation')
  }
  return createAnalysedItem({
    type: 'notation',
    workspaceId: opts.workspaceId,
    title: tuneSnapshot.name || detectedTitle || (baseTitle + ' — notation'),
    tuneSnapshot: tuneSnapshot,
    successMessage: 'OMR notation saved to scratchpad',
    onOpenItem: opts.onOpenItem,
  })
}

export async function runScratchpadAudioChordsAnalyse(item, options) {
  const opts = options || {}
  const blob = await resolveScratchpadItemAudioBlob(item, { source: 'mixdown' })
  if (!blob || blob.size === 0) throw new Error('Audio data is not available')

  const accessToken = resolveAccessToken(opts.token)
  const fileName = audioFileName(item)
  const discovery = await discoverChordsFromSource({
    source: {
      kind: 'recording',
      blob: blob,
      fileName: fileName,
      label: sourceTitle(item),
    },
    accessToken: accessToken,
    signal: opts.signal,
    onProgress: function(message) {
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(message, 0)
      }
    },
  })

  const chordsText = formatDiscoveredChords({
    segments: discovery.segments,
    beatTimes: discovery.beatTimes,
    beatsPerBar: 4,
    slotsPerBeat: 2,
  })
  if (!chordsText) {
    throw new Error('No chords were detected in this audio')
  }

  return createAnalysedItem({
    type: 'text',
    workspaceId: opts.workspaceId,
    title: sourceTitle(item) + ' — chords',
    textBody: chordsText,
    successMessage: 'Chord analysis saved to scratchpad',
    onOpenItem: opts.onOpenItem,
  })
}

export async function runScratchpadAudioMelodyAnalyse(item, options) {
  const opts = options || {}
  const blob = await resolveScratchpadItemAudioBlob(item, { source: 'mixdown' })
  if (!blob || blob.size === 0) throw new Error('Audio data is not available')

  const accessToken = resolveAccessToken(opts.token)
  const fileName = audioFileName(item)
  const processing = buildAnalysisProcessingPayload(loadMelodyProcessingSettings())
  const analysis = await analyzeMediaFromSource({
    source: {
      kind: 'recording',
      blob: blob,
      fileName: fileName,
      label: sourceTitle(item),
    },
    accessToken: accessToken,
    signal: opts.signal,
    processing: processing,
    onProgress: opts.onProgress,
  })

  const skeleton = blankNotationTune(null, sourceTitle(item) + ' — melody')
  const formatted = formatMediaAnalysisForTune(analysis, skeleton, opts.tunebook)
  const abcText = buildMediaAnalysisNotationAbc(formatted, skeleton, {
    abcjsParser: opts.abcjsParser,
  })
  if (!abcText || !String(formatted.melodyText || '').trim()) {
    throw new Error('No melody was detected in this audio')
  }

  const tuneSnapshot = notationFromAbcText(abcText, opts.tunebook, sourceTitle(item) + ' — melody')
  if (!tuneSnapshot) {
    throw new Error('Could not convert melody to notation')
  }

  return createAnalysedItem({
    type: 'notation',
    workspaceId: opts.workspaceId,
    title: tuneSnapshot.name || (sourceTitle(item) + ' — melody'),
    tuneSnapshot: tuneSnapshot,
    successMessage: 'Melody analysis saved to scratchpad',
    onOpenItem: opts.onOpenItem,
  })
}

export async function runScratchpadAudioLyricsAnalyse(item, options) {
  const opts = options || {}
  const blob = await resolveScratchpadItemAudioBlob(item, { source: 'mixdown' })
  if (!blob || blob.size === 0) throw new Error('Audio data is not available')

  const accessToken = resolveAccessToken(opts.token)
  const fileName = audioFileName(item)
  const transcription = await transcribeLyricsSource({
    source: {
      kind: 'recording',
      blob: blob,
      fileName: fileName,
      label: sourceTitle(item),
    },
    accessToken: accessToken,
    signal: opts.signal,
    onProgress: function(message) {
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(message, 0)
      }
    },
  })

  const lyricsText = transcription && transcription.text ? String(transcription.text).trim() : ''
  if (!lyricsText) {
    throw new Error('No lyrics were transcribed from this audio')
  }

  return createAnalysedItem({
    type: 'text',
    workspaceId: opts.workspaceId,
    title: sourceTitle(item) + ' — lyrics',
    textBody: lyricsText,
    successMessage: 'Lyrics transcription saved to scratchpad',
    onOpenItem: opts.onOpenItem,
  })
}

export async function runScratchpadAnalyse(item, options) {
  const opts = options || {}
  const mode = opts.mode
  if (!item) throw new Error('Missing scratchpad item')
  if (!opts.workspaceId) throw new Error('Choose a scratchpad workspace')

  const controller = new AbortController()
  if (opts.signal) {
    if (opts.signal.aborted) {
      controller.abort()
    } else {
      opts.signal.addEventListener('abort', function() {
        controller.abort()
      })
    }
  }

  const unregister = registerLongRunningJob({
    label: analyseJobLabel(item, mode),
    onCancel: function() {
      controller.abort()
    },
  })

  const runOpts = Object.assign({}, opts, { signal: controller.signal })

  try {
    if (item.type === 'image') {
      return await runScratchpadImageAnalyse(item, runOpts)
    }
    if (item.type === 'audio') {
      if (mode === 'melody') {
        return await runScratchpadAudioMelodyAnalyse(item, runOpts)
      }
      if (mode === 'lyrics') {
        return await runScratchpadAudioLyricsAnalyse(item, runOpts)
      }
      return await runScratchpadAudioChordsAnalyse(item, runOpts)
    }
    throw new Error('This item type cannot be analysed')
  } catch (e) {
    if (!e || e.name === 'AbortError') return null
    if (e.message && e.message.indexOf('cancelled') >= 0) return null
    if (!e.message || e.message.indexOf('Could not save analysis') === -1) {
      toast.error(e.message || 'Analysis failed')
    }
    throw e
  } finally {
    unregister()
  }
}
