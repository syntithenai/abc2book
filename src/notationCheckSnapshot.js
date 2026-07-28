import { resolvePrimaryVoiceKey } from './abcVoiceUtils'

/**
 * Build a tune snapshot for live notation checks, merging unsaved voice bodies.
 *
 * @param {object} tune - persisted tune
 * @param {object} liveBodies - map of voiceKey -> ABC body string
 * @param {string[]} [voiceKeys] - keys to merge; defaults to all keys in liveBodies
 */
export function buildNotationCheckTune(tune, liveBodies, voiceKeys) {
  if (!tune) return null
  const snapshot = JSON.parse(JSON.stringify(tune))
  const bodies = liveBodies || {}
  const keys = Array.isArray(voiceKeys) && voiceKeys.length
    ? voiceKeys
    : Object.keys(bodies)

  keys.forEach(function(voiceKey) {
    if (bodies[voiceKey] == null) return
    if (!snapshot.voices) snapshot.voices = {}
    if (!snapshot.voices[voiceKey]) {
      snapshot.voices[voiceKey] = { notes: [] }
    }
    const lines = String(bodies[voiceKey] || '').split('\n')
    snapshot.voices[voiceKey].notes = lines.length ? lines : ['']
  })

  return snapshot
}

export function primaryVoiceKeyForTune(tune) {
  if (!tune || !tune.voices) return '1'
  return resolvePrimaryVoiceKey(tune.voices)
}
