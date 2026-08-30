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
 * Existing-library merges (mergeTargetId / exactId) never inline onto Add — they
 * go to Import Review so the user can choose merge targets / confirm.
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

    const sole = candidates.length === 1 ? candidates[0] : null;
    const isExistingLibraryMerge = !!(sole && (
      sole.mergeTargetId
      || sole.mergeStatus === 'exactId'
      || sole.mergeStatus === 'exactHash'
      || sole.mergeStatus === 'titleMatch'
    ));

    if (importContext && importContext.stayOnForm && sole
      && canApplyImportInline(sole.sourceKind)
      && !isExistingLibraryMerge) {
      const c = sole;
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
  const sole = classified.candidates.length === 1 ? classified.candidates[0] : null;
  const isExistingLibraryMerge = !!(sole && (
    sole.mergeTargetId
    || sole.mergeStatus === 'exactId'
    || sole.mergeStatus === 'exactHash'
    || sole.mergeStatus === 'titleMatch'
  ));
  // Rich single-tune formats and library merges leave the slim Add form.
  const closeModal = !(importContext && importContext.stayOnForm
    && classified.candidates.length === 1
    && canApplyImportInline(sole && sole.sourceKind)
    && !isExistingLibraryMerge);
  return {
    handled: true,
    closeModal: closeModal,
    inline: false,
    bulkReviewRequired: false,
    candidates: classified.candidates,
  };
}

export default processReviewResult;
