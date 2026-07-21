// Lightweight helper used by AddSongModal; exported separately to allow unit tests
import { canApplyImportInline } from './importReviewFieldUtils';
import {
  classifyImportOutcome,
  multiTuneRedirectToastMessage,
} from './importIntakePolicy';

export { canApplyImportInline };

/**
 * Handle a dispatchAddImport review result.
 * When maxCandidates === 1 and N > 1 (editor), redirects to import review with toast.
 * Multi-tune (N > 1) and rich single-tune formats always open Import Review — never
 * stay inline on the slim Add form (only abc / chordsheet / bulk-text can inline).
 */
export function processReviewResult(result, importContext, applyImportedTune, startImportReview, toastLib) {
  if (!result || result.action !== 'review') {
    return { handled: false, closeModal: false, inline: false, bulkReviewRequired: false };
  }
  try {
    const classified = classifyImportOutcome(result.candidates || [], importContext || {});
    const candidates = classified.candidates;

    if (classified.bulkReviewRequired || candidates.length > 1) {
      if (toastLib && toastLib.info) {
        toastLib.info(multiTuneRedirectToastMessage(classified.candidateCount || candidates.length));
      } else if (toastLib && toastLib.success) {
        toastLib.success(multiTuneRedirectToastMessage(classified.candidateCount || candidates.length));
      }
      startImportReview(candidates);
      return {
        handled: true,
        closeModal: true,
        inline: false,
        bulkReviewRequired: true,
        candidates: candidates,
      };
    }

    if (importContext && importContext.stayOnForm && candidates.length === 1
      && canApplyImportInline(candidates[0].sourceKind)) {
      const c = candidates[0];
      if (c && c.tune) {
        const applied = applyImportedTune(c.tune, c);
        if (!applied) {
          startImportReview(candidates);
          return {
            handled: true,
            closeModal: false,
            inline: false,
            bulkReviewRequired: false,
            candidates: candidates,
          };
        }
        if (toastLib && toastLib.success) toastLib.success('Imported into form');
        return {
          handled: true,
          closeModal: false,
          inline: true,
          bulkReviewRequired: false,
          candidates: candidates,
        };
      }
    }
  } catch (e) {
    // fall through to queue handoff on any error
  }
  const classified = classifyImportOutcome(result.candidates || [], importContext || {});
  startImportReview(classified.candidates);
  // Rich single-tune formats leave the slim Add form for full Import Review chrome.
  const closeModal = !(importContext && importContext.stayOnForm
    && classified.candidates.length === 1
    && canApplyImportInline(classified.candidates[0] && classified.candidates[0].sourceKind));
  return {
    handled: true,
    closeModal: closeModal,
    inline: false,
    bulkReviewRequired: false,
    candidates: classified.candidates,
  };
}

export default processReviewResult;
