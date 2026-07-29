import utilsFunctions from './utilsFunctions'
import { getScratchpadBlob } from './scratchpadBlobs'
import { decodeAudioBlob } from './audioSilenceUtils'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'
import {
  scratchpadTrackTakeBlobKey,
  scratchpadMidiTakeBlobKey,
  scratchpadStemBlobKey,
} from './scratchpadBlobs'

const utils = utilsFunctions()

export const AUDIO_PROJECT_VERSION = 2
export const MAX_PROJECT_UNDO = 20
export const DEFAULT_MAIN_LANE_HEIGHT = 100
export const TAKE_LANE_HEIGHT = 28

export function generateFolderId() {
  return 'fld-' + utils.generateObjectId()
}

export function nowIso() {
  return new Date().toISOString()
}

export function generateTrackId() {
  return 'trk-' + utils.generateObjectId()
}

export function generateTakeId() {
  return 'take-' + utils.generateObjectId()
}

export function createDefaultSyncMeta() {
  return {
    driveFolderId: null,
    updatedAt: nowIso(),
    uploadPending: false,
  }
}

export function createDefaultAudioTake(itemId, trackId, takeId) {
  const tid = takeId || generateTakeId()
  return {
    id: tid,
    blobKey: scratchpadTrackTakeBlobKey(itemId, trackId, tid),
    driveFileId: null,
    recordedAt: null,
    gain: 1,
    cuein: 0,
    cueout: null,
    fadeIn: null,
    fadeOut: null,
  }
}

export function createDefaultAudioTrack(itemId, name, options) {
  const opts = options || {}
  const trackId = opts.id || generateTrackId()
  const takeId = opts.takeId || generateTakeId()
  return {
    id: trackId,
    type: 'audio',
    name: name || 'Track 1',
    gain: opts.gain != null ? opts.gain : 0.5,
    muted: false,
    soloed: false,
    stereoPan: 0,
    start: opts.start || 0,
    activeTakeId: takeId,
    armed: false,
    takes: [createDefaultAudioTake(itemId, trackId, takeId)],
    compRegions: [],
    compEnabled: false,
    stemSource: opts.stemSource || null,
    folderId: opts.folderId || null,
    laneHeight: opts.laneHeight != null ? opts.laneHeight : DEFAULT_MAIN_LANE_HEIGHT,
  }
}

export function createDefaultMidiTake(itemId, trackId, takeId) {
  const tid = takeId || generateTakeId()
  return {
    id: tid,
    events: [],
    midiBlobKey: scratchpadMidiTakeBlobKey(itemId, trackId, tid),
    previewBlobKey: null,
    driveFileId: null,
    recordedAt: null,
  }
}

export function createDefaultMidiTrack(itemId, name) {
  const trackId = generateTrackId()
  const takeId = generateTakeId()
  return {
    id: trackId,
    type: 'midi',
    name: name || 'MIDI',
    gain: 0.8,
    muted: false,
    soloed: false,
    stereoPan: 0,
    start: 0,
    activeTakeId: takeId,
    armed: false,
    takes: [createDefaultMidiTake(itemId, trackId, takeId)],
    compRegions: [],
    compEnabled: false,
    stemSource: null,
    folderId: null,
    laneHeight: DEFAULT_MAIN_LANE_HEIGHT,
  }
}

export function createDefaultAudioProject(itemId, options) {
  const opts = options || {}
  const track = createDefaultAudioTrack(itemId, opts.trackName || 'Track 1', opts)
  return {
    version: AUDIO_PROJECT_VERSION,
    sampleRate: opts.sampleRate || 48000,
    tempo: opts.tempo || 120,
    countInBars: opts.countInBars || 1,
    rhythmConfig: opts.rhythmConfig || null,
    metronomeEnabled: !!opts.metronomeEnabled,
    metronomeDuringPlayback: !!opts.metronomeDuringPlayback,
    metronomeDuringRecording: !!opts.metronomeDuringRecording,
    punchInEnabled: false,
    recordMode: 'newTake',
    tracks: [track],
    trackFolders: [],
    markers: [],
    loops: [],
    stemMeta: null,
    mixdownBlobKey: null,
    mixdownDriveFileId: null,
  }
}

export function migrateLegacyAudioItem(item) {
  if (!item || item.type !== 'audio') return item
  const audio = item.audio || {}
  if (audio.version >= AUDIO_PROJECT_VERSION && Array.isArray(audio.tracks) && audio.tracks.length) {
    return item
  }
  const legacyKey = audio.blobKey
  const trackId = generateTrackId()
  const takeId = generateTakeId()
  const take = createDefaultAudioTake(item.id, trackId, takeId)
  if (legacyKey) {
    take.blobKey = legacyKey
  }
  const migrated = Object.assign({}, audio, {
    version: AUDIO_PROJECT_VERSION,
    sampleRate: audio.sampleRate || 48000,
    tempo: audio.tempo || 120,
    countInBars: audio.countInBars || 1,
    punchInEnabled: !!audio.punchInEnabled,
    recordMode: audio.recordMode || 'newTake',
    tracks: [Object.assign(createDefaultAudioTrack(item.id, 'Main', { id: trackId, takeId: takeId }), {
      activeTakeId: takeId,
      takes: [take],
    })],
    markers: Array.isArray(audio.markers) ? audio.markers.slice() : [],
    loops: Array.isArray(audio.loops) ? audio.loops.slice() : [],
    stemMeta: audio.stemMeta || null,
    mixdownBlobKey: audio.mixdownBlobKey || null,
    mixdownDriveFileId: audio.mixdownDriveFileId || null,
  })
  delete migrated.blobKey
  return Object.assign({}, item, {
    audio: migrated,
    sync: item.sync || createDefaultSyncMeta(),
  })
}

export function normalizeAudioProject(item) {
  if (!item) return null
  if (item.version >= AUDIO_PROJECT_VERSION && Array.isArray(item.tracks)) {
    const audio = Object.assign({}, item)
    audio.tracks = (audio.tracks || []).map(function(track) {
      const next = Object.assign({}, track)
      next.takes = (next.takes || []).map(function(take) {
        return Object.assign({}, take)
      })
      if (!next.activeTakeId && next.takes.length) {
        next.activeTakeId = next.takes[0].id
      }
      next.compRegions = Array.isArray(next.compRegions) ? next.compRegions.slice() : []
      if (next.laneHeight == null) next.laneHeight = DEFAULT_MAIN_LANE_HEIGHT
      if (next.folderId === undefined) next.folderId = null
      return next
    })
    if (!Array.isArray(audio.trackFolders)) {
      audio.trackFolders = []
    }
    if (!audio.tracks.length) {
      audio.tracks = [createDefaultAudioTrack(item.id || 'item', 'Track 1')]
    }
    return audio
  }
  if (item.type !== 'audio') return null
  const migrated = migrateLegacyAudioItem(item)
  const audio = Object.assign({}, migrated.audio)
  audio.version = AUDIO_PROJECT_VERSION
  audio.tracks = (audio.tracks || []).map(function(track) {
    const next = Object.assign({}, track)
    next.takes = (next.takes || []).map(function(take) {
      return Object.assign({}, take)
    })
    if (!next.activeTakeId && next.takes.length) {
      next.activeTakeId = next.takes[0].id
    }
    next.compRegions = Array.isArray(next.compRegions) ? next.compRegions.slice() : []
    if (next.laneHeight == null) next.laneHeight = DEFAULT_MAIN_LANE_HEIGHT
    if (next.folderId === undefined) next.folderId = null
    return next
  })
  if (!Array.isArray(audio.trackFolders)) {
    audio.trackFolders = []
  }
  if (!audio.tracks.length) {
    audio.tracks = [createDefaultAudioTrack(item.id, 'Track 1')]
  }
  return audio
}

export function resolveAudioProject(item, audioOverride) {
  if (audioOverride) {
    const withId = Object.assign({ id: item && item.id }, audioOverride)
    if (withId.version >= AUDIO_PROJECT_VERSION && Array.isArray(withId.tracks)) {
      return normalizeAudioProject(withId)
    }
  }
  if (item && item.type === 'audio') {
    const normalized = normalizeAudioProject(item)
    if (normalized) return normalized
  }
  if (item && item.id) {
    return createDefaultAudioProject(item.id)
  }
  return createDefaultAudioProject('item')
}

export function getTrackById(audio, trackId) {
  return (audio.tracks || []).find(function(t) { return t.id === trackId }) || null
}

export function getActiveTake(track) {
  if (!track || !Array.isArray(track.takes)) return null
  return track.takes.find(function(t) { return t.id === track.activeTakeId }) || track.takes[0] || null
}

export function getTakeById(track, takeId) {
  return (track.takes || []).find(function(t) { return t.id === takeId }) || null
}

export function addTakeToTrack(track, itemId, blob) {
  const takeId = generateTakeId()
  const take = createDefaultAudioTake(itemId, track.id, takeId)
  if (blob) {
    take.recordedAt = Date.now()
  }
  return Object.assign({}, track, {
    activeTakeId: takeId,
    takes: (track.takes || []).concat([take]),
  })
}

export function setActiveTakeOnTrack(track, takeId) {
  if (!getTakeById(track, takeId)) return track
  return Object.assign({}, track, { activeTakeId: takeId })
}

export function collectProjectBlobKeys(audio) {
  const keys = []
  ;(audio.tracks || []).forEach(function(track) {
    ;(track.takes || []).forEach(function(take) {
      if (track.type === 'midi') {
        if (take.midiBlobKey) keys.push(take.midiBlobKey)
        if (take.previewBlobKey) keys.push(take.previewBlobKey)
      } else if (take.blobKey) {
        keys.push(take.blobKey)
      }
    })
  })
  if (audio.mixdownBlobKey) keys.push(audio.mixdownBlobKey)
  return keys
}

export function collectAudioDriveFileIds(audio) {
  if (!audio) return []
  const normalized = Array.isArray(audio.tracks)
    ? normalizeAudioProject(Object.assign({ version: AUDIO_PROJECT_VERSION }, audio))
    : normalizeAudioProject({ type: 'audio', audio: audio, id: 'item' })
  const ids = []
  ;(normalized.tracks || []).forEach(function(track) {
    ;(track.takes || []).forEach(function(take) {
      if (take.driveFileId) ids.push(String(take.driveFileId))
    })
  })
  if (normalized.mixdownDriveFileId) ids.push(String(normalized.mixdownDriveFileId))
  return ids
}

export function findOrphanedAudioDriveFileIds(prevAudio, nextAudio) {
  const prev = collectAudioDriveFileIds(prevAudio)
  const nextSet = {}
  collectAudioDriveFileIds(nextAudio).forEach(function(id) {
    nextSet[id] = true
  })
  return prev.filter(function(id) {
    return id && !nextSet[id]
  })
}

export async function projectHasAudioContent(audio) {
  const keys = collectProjectBlobKeys(audio)
  for (let i = 0; i < keys.length; i += 1) {
    const blob = await getScratchpadBlob(keys[i])
    if (blob && blob.size > 0) return true
  }
  return false
}

export async function loadProjectTracks(item, audioOverride) {
  const audio = resolveAudioProject(item, audioOverride)
  const specs = []
  const folders = audio.trackFolders || []
  for (let i = 0; i < audio.tracks.length; i += 1) {
    const track = audio.tracks[i]
    if (!isTrackVisibleInFolder(track, folders)) continue
    if (track.type === 'midi') continue
    const mainHeight = track.laneHeight != null ? track.laneHeight : DEFAULT_MAIN_LANE_HEIGHT
    const take = getActiveTake(track)
    if (take && take.blobKey) {
      let blob = await getScratchpadBlob(take.blobKey)
      if (track.compEnabled && (track.compRegions || []).length) {
        const compBlob = await buildCompBuffer(track, getScratchpadBlob)
        if (compBlob) blob = compBlob
      }
      if (blob && blob.size > 0) {
        const spec = {
          src: blob,
          name: track.name || 'Track',
          gain: track.gain != null ? track.gain : 0.5,
          muted: !!track.muted,
          soloed: !!track.soloed,
          start: track.start || 0,
          stereoPan: track.stereoPan || 0,
          customClass: 'main-' + track.id,
          laneRole: 'main',
          laneHeight: mainHeight,
          trackId: track.id,
        }
        if (take.cuein) spec.cuein = take.cuein
        if (take.cueout) spec.cueout = take.cueout
        if (take.fadeIn) spec.fadeIn = take.fadeIn
        if (take.fadeOut) spec.fadeOut = take.fadeOut
        specs.push(spec)
      }
    }
    const takes = track.takes || []
    for (let t = 0; t < takes.length; t += 1) {
      const takeRow = takes[t]
      if (!takeRow || !takeRow.blobKey) continue
      const takeBlob = await getScratchpadBlob(takeRow.blobKey)
      if (!takeBlob || takeBlob.size <= 0) continue
      specs.push({
        src: takeBlob,
        name: '',
        gain: 1,
        muted: true,
        soloed: false,
        start: track.start || 0,
        stereoPan: 0,
        customClass: 'take-' + track.id + '-' + takeRow.id,
        laneRole: 'take',
        laneHeight: TAKE_LANE_HEIGHT,
        trackId: track.id,
        takeId: takeRow.id,
        activeTake: takeRow.id === track.activeTakeId,
        waveOutlineColor: takeRow.id === track.activeTakeId ? '#0d6efd' : '#c8d0d8',
      })
    }
  }
  return specs
}

export async function getProjectDuration(audio) {
  if (!audio || !Array.isArray(audio.tracks)) return 0
  let max = 0
  const tracks = audio.tracks
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i]
    if (track.type === 'midi') {
      const take = getActiveTake(track)
      ;(take && take.events || []).forEach(function(ev) {
        if (ev.end > max) max = ev.end
      })
      continue
    }
    const take = getActiveTake(track)
    if (!take || !take.blobKey) continue
    try {
      const blob = await getScratchpadBlob(take.blobKey)
      if (!blob) continue
      const buf = await decodeAudioBlob(blob)
      const end = (track.start || 0) + buf.duration
      if (end > max) max = end
    } catch (e) { /* skip */ }
  }
  return max
}

function sliceBuffer(audioBuffer, startSec, endSec) {
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.max(0, Math.floor(startSec * sampleRate))
  const endSample = Math.min(audioBuffer.length, Math.ceil(endSec * sampleRate))
  const length = Math.max(0, endSample - startSample)
  const offline = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    length,
    sampleRate
  )
  const source = offline.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offline.destination)
  source.start(0, startSample / sampleRate, length / sampleRate)
  return offline.startRendering()
}

export async function spliceAudioBlob(baseBlob, insertBlob, offsetSec) {
  const base = await decodeAudioBlob(baseBlob)
  const insert = await decodeAudioBlob(insertBlob)
  const sampleRate = base.sampleRate
  const channels = base.numberOfChannels
  const offsetSample = Math.floor(Math.max(0, offsetSec) * sampleRate)
  const outLength = Math.max(base.length, offsetSample + insert.length)
  const offline = new OfflineAudioContext(channels, outLength, sampleRate)
  const baseSource = offline.createBufferSource()
  baseSource.buffer = base
  baseSource.connect(offline.destination)
  baseSource.start(0)
  const insertSource = offline.createBufferSource()
  insertSource.buffer = insert
  insertSource.connect(offline.destination)
  insertSource.start(offsetSample / sampleRate)
  const rendered = await offline.startRendering()
  return encodeAudioBufferToWav(rendered)
}

export async function buildCompBuffer(track, getBlob) {
  const regions = (track.compRegions || []).slice().sort(function(a, b) {
    return a.start - b.start
  })
  if (!regions.length) {
    const take = getActiveTake(track)
    if (!take) return null
    return getBlob(take.blobKey)
  }
  const takeBuffers = {}
  for (let i = 0; i < track.takes.length; i += 1) {
    const take = track.takes[i]
    if (!take.blobKey) continue
    const blob = await getBlob(take.blobKey)
    if (blob) takeBuffers[take.id] = await decodeAudioBlob(blob)
  }
  const activeTake = getActiveTake(track)
  const baseBuffer = activeTake && takeBuffers[activeTake.id]
    ? takeBuffers[activeTake.id]
    : null
  if (!baseBuffer) return null
  const sampleRate = baseBuffer.sampleRate
  const channels = baseBuffer.numberOfChannels
  const duration = baseBuffer.duration
  const offline = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate)
  const dest = offline.createGain()
  dest.connect(offline.destination)
  const baseSrc = offline.createBufferSource()
  baseSrc.buffer = baseBuffer
  baseSrc.connect(dest)
  baseSrc.start(0)
  regions.forEach(function(region) {
    const buf = takeBuffers[region.takeId]
    if (!buf) return
    const src = offline.createBufferSource()
    src.buffer = buf
    src.connect(dest)
    const offset = region.offset || 0
    const regionDur = region.end - region.start
    src.start(region.start, offset, regionDur)
  })
  const rendered = await offline.startRendering()
  return encodeAudioBufferToWav(rendered)
}

export async function snapshotProject(item, getBlob, putBlob) {
  const audio = normalizeAudioProject(item)
  const blobMap = {}
  const keys = collectProjectBlobKeys(audio)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const blob = await getBlob(key)
    if (blob) blobMap[key] = blob
  }
  return {
    audio: JSON.parse(JSON.stringify(audio)),
    blobs: blobMap,
  }
}

export async function restoreProjectSnapshot(snapshot, putBlob) {
  const keys = Object.keys(snapshot.blobs || {})
  for (let i = 0; i < keys.length; i += 1) {
    await putBlob(keys[i], snapshot.blobs[keys[i]])
  }
  return snapshot.audio
}

export function createStemTracks(itemId, audio, stemNames, sourceTakeId) {
  const tracks = (audio.tracks || []).slice()
  stemNames.forEach(function(stemName) {
    const trackId = generateTrackId()
    const takeId = generateTakeId()
    const take = createDefaultAudioTake(itemId, trackId, takeId)
    take.blobKey = scratchpadStemBlobKey(itemId, stemName)
    tracks.push({
      id: trackId,
      type: 'audio',
      name: stemName.charAt(0).toUpperCase() + stemName.slice(1),
      gain: 0.5,
      muted: false,
      soloed: false,
      stereoPan: 0,
      start: 0,
      activeTakeId: takeId,
      armed: false,
      takes: [take],
      compRegions: [],
      compEnabled: false,
      stemSource: { sourceTakeId: sourceTakeId, stemName: stemName },
    })
  })
  return Object.assign({}, audio, { tracks: tracks })
}

export function midiEventsToTimedMelody(events, tempo) {
  return {
    version: 1,
    tempo: tempo || 120,
    notes: (events || []).map(function(ev, index) {
      return {
        id: ev.id || ('note-' + index),
        start: Number(ev.start) || 0,
        end: Number(ev.end) || Number(ev.start) || 0,
        midi: Number(ev.midi),
        name: ev.name || '',
      }
    }).filter(function(n) { return Number.isFinite(n.midi) }),
  }
}

export function assignCompRegion(track, start, end, takeId, options) {
  const opts = options || {}
  const regions = (track.compRegions || []).filter(function(r) {
    return r.end <= start || r.start >= end
  })
  regions.push({
    start: start,
    end: end,
    takeId: takeId,
    offset: 0,
    crossfadeSec: opts.crossfadeSec != null ? opts.crossfadeSec : 0.05,
  })
  regions.sort(function(a, b) { return a.start - b.start })
  return Object.assign({}, track, { compRegions: regions, compEnabled: true })
}

export function createTrackFolder(name) {
  return {
    id: generateFolderId(),
    name: name || 'Folder',
    collapsed: false,
  }
}

export function reorderTracks(tracks, fromIndex, toIndex) {
  const list = (tracks || []).slice()
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return list
  }
  const item = list.splice(fromIndex, 1)[0]
  list.splice(toIndex, 0, item)
  return list
}

export function moveTrackToFolder(track, folderId) {
  return Object.assign({}, track, { folderId: folderId || null })
}

export function toggleTrackFolderCollapsed(folders, folderId) {
  return (folders || []).map(function(folder) {
    if (folder.id !== folderId) return folder
    return Object.assign({}, folder, { collapsed: !folder.collapsed })
  })
}

export function removeTrackFolder(folders, folderId) {
  return (folders || []).filter(function(folder) { return folder.id !== folderId })
}

export function renameTrackFolder(folders, folderId, name) {
  return (folders || []).map(function(folder) {
    if (folder.id !== folderId) return folder
    return Object.assign({}, folder, { name: name || folder.name })
  })
}

export function isTrackVisibleInFolder(track, folders) {
  if (!track || !track.folderId) return true
  const folder = (folders || []).find(function(f) { return f.id === track.folderId })
  return !folder || !folder.collapsed
}

export function trackBlockHeight(track) {
  if (!track) return DEFAULT_MAIN_LANE_HEIGHT
  const main = track.laneHeight != null ? track.laneHeight : DEFAULT_MAIN_LANE_HEIGHT
  if (track.type !== 'audio') return main
  const takeCount = (track.takes || []).length
  return main + takeCount * TAKE_LANE_HEIGHT
}

/**
 * Lane list in the same order and heights as waveform-playlist rows (main + take lanes per track).
 */
export function enumeratePlaylistLanes(audio, advancedFeatures) {
  const folders = audio.trackFolders || []
  const lanes = []
  const tracks = audio.tracks || []
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i]
    if (!isTrackVisibleInFolder(track, folders)) continue
    if (track.type === 'midi') {
      if (!advancedFeatures) continue
      lanes.push({
        kind: 'midi',
        track: track,
        height: track.laneHeight != null ? track.laneHeight : DEFAULT_MAIN_LANE_HEIGHT,
      })
      continue
    }
    const mainHeight = track.laneHeight != null ? track.laneHeight : DEFAULT_MAIN_LANE_HEIGHT
    const take = getActiveTake(track)
    if (take && take.blobKey) {
      lanes.push({ kind: 'main', track: track, height: mainHeight })
    }
    const takes = track.takes || []
    for (let t = 0; t < takes.length; t += 1) {
      const takeRow = takes[t]
      if (!takeRow || !takeRow.blobKey) continue
      lanes.push({
        kind: 'take',
        track: track,
        take: takeRow,
        takeIndex: t,
        height: TAKE_LANE_HEIGHT,
      })
    }
  }
  return lanes
}

export function duplicateAudioTrack(itemId, track) {
  if (!track || track.type !== 'audio') return track
  const trackId = generateTrackId()
  const takes = (track.takes || []).map(function(take) {
    const takeId = generateTakeId()
    return Object.assign({}, take, {
      id: takeId,
      blobKey: scratchpadTrackTakeBlobKey(itemId, trackId, takeId),
      driveFileId: null,
    })
  })
  const activeTake = takes.find(function(t) { return t.id === track.activeTakeId }) || takes[0]
  return Object.assign({}, track, {
    id: trackId,
    name: (track.name || 'Track') + ' copy',
    armed: false,
    activeTakeId: activeTake ? activeTake.id : null,
    takes: takes,
    compRegions: (track.compRegions || []).slice(),
    folderId: track.folderId || null,
  })
}
