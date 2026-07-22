import localforage from 'localforage'

const storage = localforage.createInstance({
  name: 'abc2book',
  storeName: 'scratchpad_blobs',
})

export function scratchpadBlobKey(itemId, suffix) {
  return 'scratchpad:' + String(itemId || '') + ':' + String(suffix || 'main')
}

export function scratchpadTrackTakeBlobKey(itemId, trackId, takeId) {
  return 'scratchpad:' + String(itemId || '') + ':track:' + String(trackId || '') + ':take:' + String(takeId || '')
}

export function scratchpadMidiTakeBlobKey(itemId, trackId, takeId) {
  return 'scratchpad:' + String(itemId || '') + ':midi:' + String(trackId || '') + ':take:' + String(takeId || '')
}

export function scratchpadStemBlobKey(itemId, stemName) {
  return 'scratchpad:' + String(itemId || '') + ':stem:' + String(stemName || 'other')
}

export function scratchpadMixdownBlobKey(itemId) {
  return 'scratchpad:' + String(itemId || '') + ':mixdown'
}

export function scratchpadAudioProjectJsonKey(itemId) {
  return 'scratchpad:' + String(itemId || '') + ':audio-project-json'
}

export async function putScratchpadBlob(blobKey, blob) {
  if (!blobKey) throw new Error('Missing blob key')
  await storage.setItem(blobKey, blob)
  return blobKey
}

export async function getScratchpadBlob(blobKey) {
  if (!blobKey) return null
  return storage.getItem(blobKey)
}

export async function deleteScratchpadBlob(blobKey) {
  if (!blobKey) return
  await storage.removeItem(blobKey)
}

export async function copyScratchpadBlob(sourceKey, destKey) {
  if (!sourceKey || !destKey) return null
  const blob = await getScratchpadBlob(sourceKey)
  if (!blob) return null
  await putScratchpadBlob(destKey, blob)
  return destKey
}

export async function deleteScratchpadBlobsForItem(itemId) {
  if (!itemId) return
  const prefix = 'scratchpad:' + itemId + ':'
  const keys = await storage.keys()
  await Promise.all(keys.filter(function(key) {
    return String(key).indexOf(prefix) === 0
  }).map(function(key) {
    return storage.removeItem(key)
  }))
}
