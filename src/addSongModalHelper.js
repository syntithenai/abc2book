// Lightweight helper used by AddSongModal; exported separately to allow unit tests
export function processReviewResult(result, importContext, applyImportedTune, startImportReview, toastLib) {
  if (!result || result.action !== 'review') return false
  try {
    const candidates = result.candidates || []
    const inlineKinds = ['abc', 'chordsheet', 'bulk-text']
    if (importContext && importContext.stayOnForm && candidates.length === 1 && inlineKinds.indexOf(candidates[0].sourceKind) >= 0) {
      const c = candidates[0]
      if (c && c.tune) {
        applyImportedTune(c.tune)
        if (toastLib && toastLib.success) toastLib.success('Imported into Add form')
        return true
      }
    }
  } catch (e) {
    // fall through to queue handoff on any error
  }
  startImportReview(result.candidates)
  return true
}

export default processReviewResult
