import { requestTuneMediaAnalysis } from './useTuneMediaAnalysis'
import { tuneHasAudioForFix } from './bulkCheckFixActions'
import { isPlayRangeScannableLink } from './linkPlaybackRegionScanUtils'
import { isTuneFieldEmptyForKind } from './fieldLookupApplyUtils'
import { primaryArtist } from './tuneBibliographicUtils'
import {
  LOOKUP_FIELD_KIND_BY_OPTION,
  enhanceAccessBlock,
  filterEnhanceSelectionByAvailability,
  mediaAnalysisSuggestionKindsFromSelection,
  selectedEnhanceOptionIds,
} from './enhanceOptions'

function availabilityContextFromOptions(options) {
  if (!options) return null
  if (options.availabilityContext) return options.availabilityContext
  if (options.features == null && options.resolverAvailable == null
    && options.canResearchBackground == null && options.canAffordComposer == null
    && options.hasScannableLinkedMedia == null
    && options.needsLogin == null && options.needsNetwork == null
    && options.loginWarning == null) {
    return null
  }
  return {
    resolverAvailable: options.resolverAvailable,
    features: options.features || {},
    canResearchBackground: options.canResearchBackground,
    canAffordComposer: options.canAffordComposer,
    hasScannableLinkedMedia: options.hasScannableLinkedMedia,
    needsLogin: options.needsLogin,
    needsNetwork: options.needsNetwork,
    needsCredit: options.needsCredit,
    loginWarning: options.loginWarning || null,
  }
}

const FIELD_LOOKUP_LABELS = {
  artists: 'artist',
  albums: 'album',
  genre: 'genre',
  aliases: 'alias',
  links: 'YouTube',
}

function emptyResult() {
  return {
    started: 0,
    fieldLookups: 0,
    composer: 0,
    background: 0,
    youtube: 0,
    playRange: 0,
    analysis: 0,
    skippedNoTitle: 0,
    skippedNoAudio: 0,
    skippedHasLinks: 0,
    skippedNoScannableLinks: 0,
  }
}

function accessTokenFrom(options) {
  if (!options) return null
  if (options.accessToken) return options.accessToken
  const token = options.token
  if (!token) return null
  return token.access_token ? token.access_token : token
}

function shouldSuppressFieldLookupReview(options, tuneCount) {
  if (options && options.backgroundEnhance === true) return true
  return tuneCount > 1
}

function enqueueFieldLookup(options, tune, kind, jobOptions, tuneCount) {
  const title = tune && tune.name ? String(tune.name).trim() : ''
  if (!title || !tune || !tune.id) return null
  const fieldLookupQueue = options.fieldLookupQueue
  if (!fieldLookupQueue || typeof fieldLookupQueue.enqueueLookup !== 'function') return null
  const extraOptions = jobOptions && typeof jobOptions === 'object' ? Object.assign({}, jobOptions) : {}
  if (kind === 'links') extraOptions.alwaysPick = true
  if (shouldSuppressFieldLookupReview(options, tuneCount)) {
    extraOptions.suppressReview = true
  }
  return fieldLookupQueue.enqueueLookup({
    tuneId: tune.id,
    kind: kind,
    title: title,
    artist: primaryArtist(tune),
    tuneName: title,
    accessToken: accessTokenFrom(options),
    options: Object.keys(extraOptions).length ? extraOptions : undefined,
    searchOptions: {
      resolverAvailable: options.checked ? options.resolverAvailable : undefined,
      abcTools: options.tunebook && options.tunebook.abcTools ? options.tunebook.abcTools : null,
      isYoutubeLink: options.tunebook && options.tunebook.utils && options.tunebook.utils.isYoutubeLink
        ? options.tunebook.utils.isYoutubeLink
        : null,
    },
  })
}

function startPlaybackRegions(options, tunes, result) {
  const maybeAutoScan = options.maybeAutoScan
  if (typeof maybeAutoScan !== 'function') return
  const preferredLinkIndex = options.audioLinkIndex
  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    const links = Array.isArray(tune.links) ? tune.links : []
    let tuneStarted = false
    links.forEach(function(link, linkIndex) {
      if (preferredLinkIndex != null && Number(preferredLinkIndex) !== linkIndex) return
      if (!isPlayRangeScannableLink(link)) return
      maybeAutoScan(tune.id, linkIndex, link, {
        force: true,
        currentLinks: links,
      })
      result.playRange += 1
      result.started += 1
      tuneStarted = true
    })
    if (!tuneStarted) result.skippedNoScannableLinks += 1
  })
}

function startAudioAnalysis(options, tunes, selection, result) {
  const suggestionKinds = mediaAnalysisSuggestionKindsFromSelection(selection)
  if (!suggestionKinds.length) return
  const analysisDeps = options.analysisDeps
  if (!analysisDeps) return
  const preferredLinkIndex = options.audioLinkIndex
  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    if (!tuneHasAudioForFix(tune, options.tunebook)) {
      result.skippedNoAudio += 1
      return
    }
    const requestOptions = {
      tune: tune,
      force: true,
      suggestionKinds: suggestionKinds,
    }
    if (preferredLinkIndex != null && preferredLinkIndex !== '') {
      requestOptions.linkIndex = Number(preferredLinkIndex)
    }
    requestTuneMediaAnalysis(analysisDeps, tune.id, requestOptions)
    result.analysis += 1
    result.started += 1
  })
}

/**
 * Queue the ticked enhance jobs for one or more tunes.
 */
export function startEnhanceJobs(tunes, selection, options) {
  const result = emptyResult()
  const opts = options || {}
  const list = Array.isArray(tunes) ? tunes.filter(function(tune) { return !!(tune && tune.id) }) : []
  const availabilityContext = availabilityContextFromOptions(opts)
  const accessBlock = enhanceAccessBlock(availabilityContext)
  if (accessBlock) {
    result.blockedReason = accessBlock.message
    result.blockedKind = accessBlock.kind
    return result
  }
  const filteredSelection = filterEnhanceSelectionByAvailability(selection, availabilityContext)
  const selectedIds = selectedEnhanceOptionIds(filteredSelection)
  if (!list.length || !selectedIds.length) return result

  const selected = {}
  selectedIds.forEach(function(id) {
    selected[id] = true
  })

  const needsTitle = !!(selected.composer || selected.background || selected.youtube
    || Object.keys(LOOKUP_FIELD_KIND_BY_OPTION).some(function(optionId) {
      return !!selected[optionId]
    }))

  list.forEach(function(tune) {
    const title = tune && tune.name ? String(tune.name).trim() : ''
    if (needsTitle && !title) result.skippedNoTitle += 1

    Object.keys(LOOKUP_FIELD_KIND_BY_OPTION).forEach(function(optionId) {
      if (!selected[optionId] || !title) return
      // Lyrics enhance is one integrated search: prefer chord sheets (lyrics+chords),
      // then fall back to plain lyrics inside the same job.
      if (optionId === 'lookupLyrics') {
        const id = enqueueFieldLookup(opts, tune, 'lyrics', { preferChords: true }, list.length)
        if (id) {
          result.fieldLookups += 1
          result.started += 1
        }
        return
      }
      const id = enqueueFieldLookup(
        opts,
        tune,
        LOOKUP_FIELD_KIND_BY_OPTION[optionId],
        undefined,
        list.length
      )
      if (id) {
        result.fieldLookups += 1
        result.started += 1
      }
    })

    if (selected.youtube && title) {
      if (!isTuneFieldEmptyForKind(tune, 'links')) {
        result.skippedHasLinks += 1
        return
      }
      const id = enqueueFieldLookup(opts, tune, 'links', undefined, list.length)
      if (id) {
        result.youtube += 1
        result.started += 1
      }
    }
  })

  if ((result.fieldLookups > 0 || result.youtube > 0)
    && opts.fieldLookupQueue
    && typeof opts.fieldLookupQueue.start === 'function') {
    opts.fieldLookupQueue.start()
  }

  if (selected.composer && opts.composerQueue && typeof opts.composerQueue.enqueueTunes === 'function') {
    const canAffordComposer = opts.canAffordComposer !== false
    if (canAffordComposer) {
      const preview = opts.composerQueue.previewEnqueueTunes
        ? opts.composerQueue.previewEnqueueTunes(list)
        : { willDiscover: list.length }
      const willDiscover = preview && preview.willDiscover ? preview.willDiscover : 0
      if (willDiscover > 0) {
        opts.composerQueue.enqueueTunes(list, { accessToken: accessTokenFrom(opts) })
        if (typeof opts.composerQueue.start === 'function') opts.composerQueue.start()
        result.composer += willDiscover
        result.started += willDiscover
      }
    }
  }

  if (selected.background && opts.backgroundQueue && typeof opts.backgroundQueue.enqueueTunes === 'function') {
    const preview = opts.backgroundQueue.previewEnqueueTunes
      ? opts.backgroundQueue.previewEnqueueTunes(list)
      : { willResearch: list.length }
    const willResearch = preview && preview.willResearch ? preview.willResearch : 0
    if (willResearch > 0) {
      opts.backgroundQueue.enqueueTunes(list, {
        accessToken: accessTokenFrom(opts),
        lyricsForTune: opts.lyricsForTune,
      })
      if (typeof opts.backgroundQueue.start === 'function') opts.backgroundQueue.start()
      result.background += willResearch
      result.started += willResearch
    }
  }

  if (selected.playRange) {
    startPlaybackRegions(opts, list, result)
  }

  startAudioAnalysis(opts, list, selected, result)
  return result
}

export function enhanceStartToastMessage(result) {
  if (result && result.blockedReason) {
    return result.blockedReason
  }
  if (!result || result.started <= 0) {
    const reasons = []
    if (result && result.skippedNoTitle > 0) reasons.push('selected tunes need a title')
    if (result && result.skippedNoAudio > 0) reasons.push('no linked audio')
    if (result && result.skippedHasLinks > 0) reasons.push('links already present')
    if (result && result.skippedNoScannableLinks > 0) reasons.push('no scannable links')
    if (reasons.length) {
      return 'No enhancements started — ' + reasons.join(', ') + '.'
    }
    return 'No new enhancements queued (fields already filled or jobs already running).'
  }
  const parts = []
  if (result.fieldLookups > 0) {
    parts.push(result.fieldLookups + ' lookup' + (result.fieldLookups === 1 ? '' : 's'))
  }
  if (result.composer > 0) {
    parts.push('composer for ' + result.composer + ' tune' + (result.composer === 1 ? '' : 's'))
  }
  if (result.background > 0) {
    parts.push('background for ' + result.background + ' tune' + (result.background === 1 ? '' : 's'))
  }
  if (result.youtube > 0) {
    parts.push(result.youtube + ' YouTube search' + (result.youtube === 1 ? '' : 'es'))
  }
  if (result.playRange > 0) {
    parts.push(result.playRange + ' play range scan' + (result.playRange === 1 ? '' : 's'))
  }
  if (result.analysis > 0) {
    parts.push('audio analysis for ' + result.analysis + ' tune' + (result.analysis === 1 ? '' : 's'))
  }
  if (!parts.length) return 'Queued enhancements.'
  return 'Started ' + parts.join(', ') + '.'
}

export function fieldLookupKindLabel(kind) {
  return FIELD_LOOKUP_LABELS[kind] || kind
}
