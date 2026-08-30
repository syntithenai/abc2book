/**
 * Photo-only stubs: crop snapshot is the source of truth; ABC is intentionally empty.
 */

export function isPhotoOnlyAbc(abc) {
  return /%%?\s*photo only/i.test(String(abc || ''))
}

/**
 * @param {object|null|undefined} tune
 * @param {string} [abcText] optional precomputed ABC (e.g. from json2abc)
 */
export function isPhotoOnlyTune(tune, abcText) {
  if (!tune) return false
  if (String(tune.joinTier || '') === 'photo_only') return true
  if (Array.isArray(tune.abccomments)
    && tune.abccomments.some(function(line) {
      return /photo only/i.test(String(line || ''))
    })) {
    return true
  }
  if (typeof abcText === 'string' && isPhotoOnlyAbc(abcText)) return true
  return false
}
