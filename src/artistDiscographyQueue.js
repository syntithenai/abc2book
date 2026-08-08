import {
  appendTunesToQueue,
  createQueue,
  insertTunesAfterCurrentInQueue,
} from './nowPlayingQueue'
import { PLAYLIST_MAX_ITEMS } from './tuneScaleConstants'
import { yieldToMain } from './tuneListFilter'
import { startTunePlayback } from './tunePlaybackActions'
import {
  candidateMatchesArtistTitle,
  candidateMatchesSeenArtistTitles,
  dedupeMediaSearchCandidates,
} from './artistDiscographyCatalog'
import { isDeviceFileResult, isMusicCollectionResult } from './mediaLinkSearchDisplay'
import {
  createMediaSearchTuneLookup,
  ensureMediaSearchTune,
  isMaterializableMediaSearchCandidate,
  materializeKey,
  musicCollectionCandidateIdentityKey,
  scheduleMediaSearchTuneEnrichment,
} from './mediaSearchTuneMaterialize'

const MATERIALIZE_YIELD_INTERVAL = 25

function resolveTunesMap(context) {
  const tunebook = context.tunebook
  if (context.materializeOptions && context.materializeOptions.tunes) {
    return context.materializeOptions.tunes
  }
  if (tunebook && tunebook.tunes) return tunebook.tunes
  return context.tunes || {}
}

function candidateQueueMediaKey(candidate, tune) {
  if (isMusicCollectionResult(candidate)) {
    const key = musicCollectionCandidateIdentityKey(candidate)
    if (key) return key
  }
  const materialized = materializeKey(candidate)
  if (materialized) return materialized
  if (tune && tune.id) return 'tune:' + tune.id
  return ''
}

function tuneMatchesQueuedArtistTitles(tune, tuneIds, tunesMap) {
  if (!tune || !tune.id) return false
  const list = Array.isArray(tuneIds) ? tuneIds : []
  for (let i = 0; i < list.length; i += 1) {
    const queued = tunesMap && tunesMap[list[i]]
    if (!queued) continue
    if (candidateMatchesArtistTitle(
      { title: tune.name, artist: tune.composer },
      queued.name,
      queued.composer
    )) {
      return true
    }
  }
  return false
}

function candidateMatchesQueuedTunes(candidate, tuneIds, tunesMap) {
  if (!candidate) return false
  const list = Array.isArray(tuneIds) ? tuneIds : []
  for (let i = 0; i < list.length; i += 1) {
    const queued = tunesMap && tunesMap[list[i]]
    if (!queued) continue
    if (candidateMatchesArtistTitle(candidate, queued.name, queued.composer)) {
      return true
    }
  }
  return false
}

async function materializeCandidates(candidates, tunebook, materializeOptions) {
  const tunesMap = materializeOptions.tunes || resolveTunesMap({ tunebook: tunebook, materializeOptions: materializeOptions })
  materializeOptions.tunes = tunesMap
  const list = dedupeMediaSearchCandidates(candidates).slice(0, PLAYLIST_MAX_ITEMS)
  const tuneIds = []
  const seenTuneIds = {}
  const seenMediaKeys = {}
  const seenArtistTitles = []
  const lookup = createMediaSearchTuneLookup(tunesMap)
  let needsCommit = false

  if (tunebook && tunebook.beginTunesBatchCommit) {
    tunebook.beginTunesBatchCommit()
  }

  try {
    for (let i = 0; i < list.length; i += 1) {
      const candidate = list[i]
      if (!isMaterializableMediaSearchCandidate(candidate)) continue

      if (candidateMatchesSeenArtistTitles(candidate, seenArtistTitles)) continue
      if (candidateMatchesQueuedTunes(candidate, tuneIds, tunesMap)) continue

      const queueMediaKey = candidateQueueMediaKey(candidate, null)
      if (queueMediaKey && seenMediaKeys[queueMediaKey]) continue

      let tune = lookup.find(candidate)
      if (tune) {
        scheduleMediaSearchTuneEnrichment(tune, tunebook, materializeOptions)
      } else if (isDeviceFileResult(candidate)) {
        tune = await ensureMediaSearchTune(candidate, tunebook, Object.assign({}, materializeOptions, {
          deferCommit: true,
        }))
        if (tune) lookup.registerTune(tune)
        needsCommit = true
      } else {
        tune = await ensureMediaSearchTune(candidate, tunebook, Object.assign({}, materializeOptions, {
          deferCommit: true,
        }))
        if (!tune || !tune.id) continue
        lookup.registerTune(tune)
        tunesMap[tune.id] = tune
        if (tunebook.tunes) tunebook.tunes[tune.id] = tune
        needsCommit = true
      }

      if (!tune || !tune.id || seenTuneIds[tune.id]) continue
      const resolvedMediaKey = candidateQueueMediaKey(candidate, tune)
      if (resolvedMediaKey && seenMediaKeys[resolvedMediaKey]) continue
      if (candidateMatchesSeenArtistTitles(
        { title: tune.name, artist: tune.composer },
        seenArtistTitles
      )) continue
      if (tuneMatchesQueuedArtistTitles(tune, tuneIds, tunesMap)) continue
      seenTuneIds[tune.id] = true
      if (resolvedMediaKey) seenMediaKeys[resolvedMediaKey] = true
      seenArtistTitles.push({
        title: String((candidate && candidate.title) || tune.name || '').trim(),
        artist: String((candidate && candidate.artist) || tune.composer || '').trim(),
      })
      tuneIds.push(tune.id)

      if (i > 0 && i % MATERIALIZE_YIELD_INTERVAL === 0) {
        await yieldToMain()
      }
    }
  } finally {
    if (needsCommit && tunebook && tunebook.commitTunesBatch) {
      tunebook.commitTunesBatch()
    }
  }

  return tuneIds
}

export async function queueResolvedCandidates(candidates, context, options) {
  const opts = options || {}
  const mode = opts.mode || 'append'
  const tunebook = context.tunebook
  if (!tunebook) return { played: 0 }

  const materializeOptions = Object.assign({}, context.materializeOptions || {}, {
    tunes: resolveTunesMap(context),
  })
  const tuneIds = await materializeCandidates(candidates, tunebook, materializeOptions)
  if (!tuneIds.length) return { played: 0 }

  const queueContext = Object.assign({}, context, {
    tunes: materializeOptions.tunes,
    materializeOptions: materializeOptions,
  })
  const queueOptions = { source: 'media-search', name: opts.name || 'Artist playlist' }
  let queue = context.nowPlayingQueue

  if (mode === 'play') {
    queue = createQueue(Object.assign({}, queueOptions, {
      tuneIds: tuneIds,
      followTune: false,
      autoAdvance: true,
    }))
    if (context.setNowPlayingQueue) {
      context.setNowPlayingQueue(queue)
    }
    if (context.mediaController) {
      startTunePlayback(
        context.mediaController,
        tunebook,
        context.navigate,
        context.location,
        Object.assign({}, queueContext, {
          playTuneId: tuneIds[0],
          nowPlayingQueue: queue,
        })
      )
    }
    return { played: tuneIds.length, tuneIds: tuneIds, queue: queue }
  }

  if (mode === 'next') {
    queue = insertTunesAfterCurrentInQueue(queue, tuneIds, queueOptions)
  } else {
    queue = appendTunesToQueue(queue, tuneIds, queueOptions)
  }
  if (context.setNowPlayingQueue) {
    context.setNowPlayingQueue(queue)
  }
  return { played: tuneIds.length, tuneIds: tuneIds, queue: queue }
}

export async function playResolvedCandidate(candidate, context) {
  return queueResolvedCandidates([candidate], context, { mode: 'play' })
}

export async function appendResolvedCandidate(candidate, context) {
  return queueResolvedCandidates([candidate], context, { mode: 'append' })
}

export async function insertResolvedCandidateNext(candidate, context) {
  return queueResolvedCandidates([candidate], context, { mode: 'next' })
}
