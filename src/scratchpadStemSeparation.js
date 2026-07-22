import { separateStemsFromSource, fetchStemBuffers } from './mediaStemClient'
import { getScratchpadStemCacheKey } from './audioStemCache'
import { putScratchpadBlob } from './scratchpadBlobs'
import { createStemTracks, normalizeAudioProject } from './scratchpadAudioProject'
import { getScratchpadBlob } from './scratchpadBlobs'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'

export async function separateScratchpadStems(options) {
  const opts = options || {}
  const item = opts.item
  const trackId = opts.trackId
  const takeId = opts.takeId
  const accessToken = opts.accessToken
  const signal = opts.signal
  const onProgress = opts.onProgress
  const onStatus = opts.onStatus
  const demucsModel = opts.demucsModel

  if (!item || !item.audio) {
    throw new Error('No audio project')
  }
  const audio = normalizeAudioProject(item)
  const track = audio.tracks.find(function(t) { return t.id === trackId })
  if (!track) throw new Error('Track not found')
  const take = takeId
    ? track.takes.find(function(t) { return t.id === takeId })
    : track.takes.find(function(t) { return t.id === track.activeTakeId }) || track.takes[0]
  if (!take || !take.blobKey) throw new Error('Take has no audio')
  const blob = await getScratchpadBlob(take.blobKey)
  if (!blob || blob.size <= 0) throw new Error('Take audio is empty')

  const separation = await separateStemsFromSource({
    source: { kind: 'recording', blob: blob, fileName: 'scratchpad.wav' },
    accessToken: accessToken,
    signal: signal,
    onProgress: onProgress,
    onStatus: onStatus,
    demucsModel: demucsModel,
  })

  const fetched = await fetchStemBuffers(separation, accessToken, signal)
  const stemNames = Object.keys(fetched.stemBuffers || {})
  for (let i = 0; i < stemNames.length; i += 1) {
    const name = stemNames[i]
    const buffer = fetched.stemBuffers[name]
    if (!buffer) continue
    const wav = encodeAudioBufferToWav(buffer)
    const key = 'scratchpad:' + item.id + ':stem:' + name
    await putScratchpadBlob(key, wav)
  }

  const cacheKey = getScratchpadStemCacheKey(item.id, take.blobKey, separation.model)
  const nextAudio = createStemTracks(item.id, audio, stemNames, take.id)
  nextAudio.stemMeta = {
    cacheKey: cacheKey,
    model: separation.model || '',
    separatedAt: Date.now(),
    sourceTakeId: take.id,
    sourceTrackId: track.id,
    stemNames: stemNames,
  }

  return {
    audio: nextAudio,
    separation: separation,
    stemNames: stemNames,
  }
}
