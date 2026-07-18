/**
 * Central intake policy for import sources: candidate counts, multi-tune
 * detection, attachment/merge defaults. Used by Add, editor, and bulk flows.
 */

export const CERTAIN_MERGE_STATUSES = ['exactId', 'exactHash', 'exactYoutube'];

export const SOURCE_KIND_POLICY = {
  abc: { attachmentPolicy: 'mergeNotation', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  musicxml: { attachmentPolicy: 'mergeNotation', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  mxl: { attachmentPolicy: 'mergeNotation', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  midi: { attachmentPolicy: 'mergeNotation', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  mscz: { attachmentPolicy: 'mergeNotation', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  chordsheet: { attachmentPolicy: 'suggestOnly', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  onsong: { attachmentPolicy: 'suggestOnly', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  sbp: { attachmentPolicy: 'suggestOnly', defaultMergeMode: 'suggestOnly', editorInlineOk: false },
  ireal: { attachmentPolicy: 'suggestOnly', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  audio: { attachmentPolicy: 'attachSource', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  video: { attachmentPolicy: 'attachSource', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  sheetimage: { attachmentPolicy: 'attachSource', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  'bulk-text': { attachmentPolicy: 'suggestOnly', defaultMergeMode: 'suggestOnly', editorInlineOk: false },
  youtube: { attachmentPolicy: 'attachSource', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
  manual: { attachmentPolicy: 'suggestOnly', defaultMergeMode: 'suggestOnly', editorInlineOk: true },
};

export function policyForSourceKind(sourceKind) {
  const kind = String(sourceKind || 'manual');
  return SOURCE_KIND_POLICY[kind] || {
    attachmentPolicy: 'suggestOnly',
    defaultMergeMode: 'suggestOnly',
    editorInlineOk: false,
  };
}

export function countCandidates(candidates) {
  return Array.isArray(candidates) ? candidates.length : 0;
}

/**
 * @param {object} context - import context; maxCandidates === 1 means editor single-record
 * @param {Array} candidates
 * @returns {{ bulkReviewRequired: boolean, candidateCount: number, maxCandidates: number|null }}
 */
export function classifyMultiTuneOutcome(candidates, context) {
  const count = countCandidates(candidates);
  const maxCandidates = context && context.maxCandidates != null
    ? Number(context.maxCandidates)
    : null;
  const bulkReviewRequired = maxCandidates != null && maxCandidates >= 1 && count > maxCandidates;
  return {
    candidateCount: count,
    maxCandidates: maxCandidates,
    bulkReviewRequired: bulkReviewRequired,
  };
}

/**
 * Annotate raw parse candidates with intake policy metadata.
 * skipEnrich defaults true at intake (Enhance is opt-in).
 */
export function applyIntakePolicyToCandidates(candidates, options) {
  const opts = options || {};
  const list = Array.isArray(candidates) ? candidates : [];
  return list.map(function(raw) {
    const sourceKind = raw.sourceKind || 'manual';
    const policy = policyForSourceKind(sourceKind);
    const mergeStatus = raw.mergeStatus || 'new';
    const certain = CERTAIN_MERGE_STATUSES.indexOf(mergeStatus) >= 0;
    const mergeMode = raw.mergeMode
      || (certain ? 'direct' : policy.defaultMergeMode);
    return Object.assign({}, raw, {
      sourceKind: sourceKind,
      mergeStatus: mergeStatus,
      mergeMode: mergeMode,
      attachmentPolicy: raw.attachmentPolicy || policy.attachmentPolicy,
      warningReason: raw.warningReason || null,
      skipEnrich: raw.skipEnrich !== undefined ? !!raw.skipEnrich : true,
      skipEnrichForced: opts.forceSkipEnrich !== false,
    });
  });
}

/**
 * Full classify after parse: policy annotations + multi-tune flag.
 */
export function classifyImportOutcome(candidates, context) {
  const annotated = applyIntakePolicyToCandidates(candidates, context);
  const multi = classifyMultiTuneOutcome(annotated, context);
  return {
    candidates: annotated,
    policy: {
      attachmentPolicies: annotated.map(function(c) { return c.attachmentPolicy; }),
    },
    bulkReviewRequired: multi.bulkReviewRequired,
    candidateCount: multi.candidateCount,
    maxCandidates: multi.maxCandidates,
  };
}

export function multiTuneRedirectToastMessage(candidateCount) {
  const n = Number(candidateCount) || 0;
  if (n <= 0) return 'Opening import review';
  return n + ' tune' + (n === 1 ? '' : 's') + ' detected — opening import review';
}
