import { getLinkRegionStart, getLinkRegionEnd } from './mediaPlaybackUtils'

export function trimAudioBuffer(buffer, startSec, endSec) {
  if (!buffer) return null
  const sampleRate = buffer.sampleRate || 44100
  const totalDuration = buffer.duration || 0
  const start = Math.max(0, parseFloat(startSec) || 0)
  let end = endSec > 0 ? parseFloat(endSec) : totalDuration
  if (!end || end <= start) end = totalDuration
  end = Math.min(end, totalDuration)
  if (end <= start) return buffer

  const startFrame = Math.floor(start * sampleRate)
  const endFrame = Math.min(buffer.length, Math.ceil(end * sampleRate))
  const frameCount = Math.max(1, endFrame - startFrame)
  const channels = buffer.numberOfChannels || 1
  const out = new AudioBuffer({
    length: frameCount,
    numberOfChannels: channels,
    sampleRate: sampleRate,
  })
  for (let ch = 0; ch < channels; ch += 1) {
    const input = buffer.getChannelData(ch)
    out.getChannelData(ch).set(input.subarray(startFrame, endFrame))
  }
  return out
}

export function getLinkTrimBounds(link) {
  const startSec = getLinkRegionStart(link)
  const endSec = getLinkRegionEnd(link)
  return { startSec: startSec, endSec: endSec }
}
