import { decodeAudioBlob } from './audioSilenceUtils'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'

export function extractBufferRegion(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate
  const start = Math.max(0, Math.floor(startSec * sampleRate))
  const end = Math.min(buffer.length, Math.ceil(endSec * sampleRate))
  const length = Math.max(0, end - start)
  if (length <= 0) {
    return new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: 1, sampleRate: sampleRate })
  }
  const offline = new OfflineAudioContext(buffer.numberOfChannels, length, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0, start / sampleRate, length / sampleRate)
  return offline.startRendering()
}

export function spliceBufferReplace(fullBuffer, insertBuffer, startSec, endSec) {
  const sampleRate = fullBuffer.sampleRate
  const channels = fullBuffer.numberOfChannels
  const startSample = Math.floor(Math.max(0, startSec) * sampleRate)
  const endSample = Math.floor(Math.max(startSec, endSec) * sampleRate)
  const insertLen = insertBuffer.length
  const tailLen = Math.max(0, fullBuffer.length - endSample)
  const outLength = startSample + insertLen + tailLen
  const offline = new OfflineAudioContext(channels, Math.max(1, outLength), sampleRate)
  const dest = offline.createGain()
  dest.connect(offline.destination)
  if (startSample > 0) {
    const before = offline.createBufferSource()
    before.buffer = fullBuffer
    before.connect(dest)
    before.start(0, 0, startSample / sampleRate)
  }
  const mid = offline.createBufferSource()
  mid.buffer = insertBuffer
  mid.connect(dest)
  mid.start(startSample / sampleRate)
  if (tailLen > 0) {
    const after = offline.createBufferSource()
    after.buffer = fullBuffer
    after.connect(dest)
    after.start((startSample + insertLen) / sampleRate, endSample / sampleRate, tailLen / sampleRate)
  }
  return offline.startRendering()
}

export function spliceBufferRippleDelete(fullBuffer, startSec, endSec) {
  const sampleRate = fullBuffer.sampleRate
  const channels = fullBuffer.numberOfChannels
  const startSample = Math.floor(Math.max(0, startSec) * sampleRate)
  const endSample = Math.floor(Math.max(startSec, endSec) * sampleRate)
  const outLength = Math.max(0, fullBuffer.length - (endSample - startSample))
  const offline = new OfflineAudioContext(channels, Math.max(1, outLength), sampleRate)
  const dest = offline.createGain()
  dest.connect(offline.destination)
  if (startSample > 0) {
    const before = offline.createBufferSource()
    before.buffer = fullBuffer
    before.connect(dest)
    before.start(0, 0, startSample / sampleRate)
  }
  if (endSample < fullBuffer.length) {
    const after = offline.createBufferSource()
    after.buffer = fullBuffer
    after.connect(dest)
    after.start(startSample / sampleRate, endSample / sampleRate)
  }
  return offline.startRendering()
}

function silenceBufferRegion(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate
  const start = Math.floor(Math.max(0, startSec) * sampleRate)
  const end = Math.ceil(Math.min(buffer.duration, endSec) * sampleRate)
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch)
    const dst = out.getChannelData(ch)
    dst.set(src)
    for (let i = start; i < end && i < dst.length; i += 1) dst[i] = 0
  }
  return out
}

function reverseBufferRegion(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate
  const start = Math.floor(Math.max(0, startSec) * sampleRate)
  const end = Math.ceil(Math.min(buffer.duration, endSec) * sampleRate)
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch)
    const dst = out.getChannelData(ch)
    dst.set(src)
    const slice = dst.subarray(start, end).slice().reverse()
    dst.set(slice, start)
  }
  return out
}

function invertBufferRegion(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate
  const start = Math.floor(Math.max(0, startSec) * sampleRate)
  const end = Math.ceil(Math.min(buffer.duration, endSec) * sampleRate)
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch)
    const dst = out.getChannelData(ch)
    dst.set(src)
    for (let i = start; i < end && i < dst.length; i += 1) dst[i] = -dst[i]
  }
  return out
}

export async function cutSelectionFromBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return { blob: blob, clipboard: null }
  const buffer = await decodeAudioBlob(blob)
  const clip = await extractBufferRegion(buffer, selection.start, selection.end)
  const next = await spliceBufferRippleDelete(buffer, selection.start, selection.end)
  return {
    blob: encodeAudioBufferToWav(next),
    clipboard: encodeAudioBufferToWav(clip),
  }
}

export async function copySelectionFromBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return null
  const buffer = await decodeAudioBlob(blob)
  const clip = await extractBufferRegion(buffer, selection.start, selection.end)
  return encodeAudioBufferToWav(clip)
}

export async function pasteIntoBlob(blob, clipboardBlob, cursorSec, selection) {
  const base = await decodeAudioBlob(blob)
  const insert = await decodeAudioBlob(clipboardBlob)
  let start = cursorSec != null ? cursorSec : 0
  let end = start
  if (selection && selection.end > selection.start) {
    start = selection.start
    end = selection.end
  }
  const next = await spliceBufferReplace(base, insert, start, end)
  return encodeAudioBufferToWav(next)
}

export async function deleteSelectionFromBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return blob
  const buffer = await decodeAudioBlob(blob)
  const next = await spliceBufferRippleDelete(buffer, selection.start, selection.end)
  return encodeAudioBufferToWav(next)
}

export async function silenceSelectionInBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return blob
  const buffer = await decodeAudioBlob(blob)
  const next = silenceBufferRegion(buffer, selection.start, selection.end)
  return encodeAudioBufferToWav(next)
}

export async function reverseSelectionInBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return blob
  const buffer = await decodeAudioBlob(blob)
  const next = reverseBufferRegion(buffer, selection.start, selection.end)
  return encodeAudioBufferToWav(next)
}

export async function invertSelectionInBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return blob
  const buffer = await decodeAudioBlob(blob)
  const next = invertBufferRegion(buffer, selection.start, selection.end)
  return encodeAudioBufferToWav(next)
}

export async function trimToSelectionInBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return blob
  const buffer = await decodeAudioBlob(blob)
  const clip = await extractBufferRegion(buffer, selection.start, selection.end)
  return encodeAudioBufferToWav(clip)
}

export async function duplicateSelectionToBlob(blob, selection) {
  if (!selection || selection.end <= selection.start) return blob
  const buffer = await decodeAudioBlob(blob)
  const clip = await extractBufferRegion(buffer, selection.start, selection.end)
  const next = await spliceBufferReplace(buffer, clip, selection.end, selection.end)
  return encodeAudioBufferToWav(next)
}

export async function insertSilenceInBlob(blob, cursorSec, durationSec) {
  const buffer = await decodeAudioBlob(blob)
  const sampleRate = buffer.sampleRate
  const channels = buffer.numberOfChannels
  const insertSamples = Math.max(1, Math.floor(durationSec * sampleRate))
  const insert = new AudioBuffer({ numberOfChannels: channels, length: insertSamples, sampleRate: sampleRate })
  const next = await spliceBufferReplace(buffer, insert, cursorSec, cursorSec)
  return encodeAudioBufferToWav(next)
}

export async function repeatSelectionInBlob(blob, selection, count) {
  if (!selection || selection.end <= selection.start) return blob
  const n = Math.max(1, Math.min(20, count || 2))
  let working = await decodeAudioBlob(blob)
  const clip = await extractBufferRegion(working, selection.start, selection.end)
  let offset = selection.end
  for (let i = 1; i < n; i += 1) {
    working = await spliceBufferReplace(working, clip, offset, offset)
    offset += clip.duration
  }
  return encodeAudioBufferToWav(working)
}
