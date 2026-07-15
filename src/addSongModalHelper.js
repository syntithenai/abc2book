// Lightweight helper used by AddSongModal; exported separately to allow unit tests
import { canApplyImportInline } from './importReviewFieldUtils';

export { canApplyImportInline };

export function processReviewResult(result, importContext, applyImportedTune, startImportReview, toastLib) {
  if (!result || result.action !== 'review') {
    return { handled: false, closeModal: false, inline: false };
  }
  try {
    const candidates = result.candidates || [];
    if (importContext && importContext.stayOnForm && candidates.length === 1
      && canApplyImportInline(candidates[0].sourceKind)) {
      const c = candidates[0];
      if (c && c.tune) {
        applyImportedTune(c.tune);
        if (toastLib && toastLib.success) toastLib.success('Imported into form');
        return { handled: true, closeModal: false, inline: true };
      }
    }
  } catch (e) {
    // fall through to queue handoff on any error
  }
  startImportReview(result.candidates);
  return {
    handled: true,
    // Stay-on-form Add From must not dismiss the review/add UI.
    closeModal: !(importContext && importContext.stayOnForm),
    inline: false,
  };
}

export default processReviewResult;
