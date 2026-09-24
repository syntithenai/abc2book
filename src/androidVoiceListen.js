import { TunebookVoiceListen, isNativeVoiceListenAvailable } from './capacitor/tunebookPlugins'

export const NATIVE_STT_MIN_CONFIDENCE = 0.45

/**
 * Whether a native SpeechRecognizer result is good enough to skip Whisper.
 * Missing confidence scores (undefined / NaN / negative sentinel -1) are
 * treated as unavailable and accepted when the transcript is non-empty.
 */
export function isNativeTranscriptGoodEnough(transcript, confidence) {
  const text = typeof transcript === 'string' ? transcript.trim() : ''
  if (!text) return false
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0) {
    return true
  }
  return confidence >= NATIVE_STT_MIN_CONFIDENCE
}

/** Map SpeechRecognizer rmsdB (-2..10 typical) to a 0–1 VU level. */
export function rmsDbToLevel(rmsdB) {
  if (typeof rmsdB !== 'number' || Number.isNaN(rmsdB)) return 0
  return Math.max(0, Math.min(1, (rmsdB + 2) / 12))
}

export async function isAndroidVoiceListenReady() {
  if (!isNativeVoiceListenAvailable()) return false
  try {
    const res = await TunebookVoiceListen.isAvailable()
    return Boolean(res && res.available)
  } catch (e) {
    return false
  }
}

export async function ensureAndroidVoiceListenPermission() {
  if (!isNativeVoiceListenAvailable()) return false
  try {
    const res = await TunebookVoiceListen.ensurePermissions()
    return Boolean(res && res.granted)
  } catch (e) {
    return false
  }
}

/**
 * @param {{ locale?: string, maxMs?: number }} [opts]
 * @returns {Promise<{ transcript: string, partial?: boolean, confidence?: number, reason?: string }>}
 */
export async function listenAndroidVoice(opts) {
  if (!isNativeVoiceListenAvailable()) {
    return { transcript: '', reason: 'unavailable' }
  }
  return TunebookVoiceListen.listen(opts || {})
}

export async function stopAndroidVoiceListen() {
  if (!isNativeVoiceListenAvailable()) return
  try {
    await TunebookVoiceListen.stop()
  } catch (e) {
    // ignore
  }
}

export async function cancelAndroidVoiceListen() {
  if (!isNativeVoiceListenAvailable()) return
  try {
    await TunebookVoiceListen.cancel()
  } catch (e) {
    // ignore
  }
}

export function addAndroidVoiceListenListener(eventName, handler) {
  if (!isNativeVoiceListenAvailable()) {
    return Promise.resolve({ remove: async function() {} })
  }
  return TunebookVoiceListen.addListener(eventName, handler)
}
