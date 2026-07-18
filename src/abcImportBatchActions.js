/**
 * Shared helpers for multi-tune ABC batch import (Google share + Add-from-file).
 */

function asArray(bucket) {
  if (!bucket) return [];
  if (Array.isArray(bucket)) return bucket;
  if (typeof bucket === 'object') {
    return Object.keys(bucket).map(function(key) { return bucket[key]; });
  }
  return [];
}

function tuneKey(tune) {
  if (!tune) return '';
  if (tune.id) return 'id:' + String(tune.id);
  return 'name:' + String(tune.name || tune.title || '');
}

/** Candidates that should not be one-click applied. */
export function isUncertainAbcCandidate(candidate) {
  if (!candidate) return false;
  if (candidate.warningReason === 'upToDate') return false;
  if (candidate.warningReason === 'localNewer') return true;
  if (candidate.warningReason === 'libraryMatch') return true;
  if (candidate.contentHashDuplicate || candidate.warningReason === 'contentHashDuplicate') return true;
  if (candidate.mergeStatus === 'titleMatch') return true;
  if (candidate.mergeStatus === 'exactId' && candidate.mergeMode === 'direct') return false;
  if (candidate.mergeStatus === 'new' && !candidate.mergeTargetId) return false;
  if (candidate.mergeStatus === 'exactId' && candidate.mergeMode === 'suggestOnly') return true;
  return true;
}

/**
 * Candidates to open in Import Review from a batch summary.
 * @param {object} batchSummary
 * @param {{ includeDuplicates?: boolean, onlyUncertain?: boolean }} [options]
 */
export function reviewCandidatesFromBatch(batchSummary, options) {
  const opts = options || {};
  const includeDuplicates = !!opts.includeDuplicates;
  const onlyUncertain = opts.onlyUncertain !== false;
  let candidates = ((batchSummary && batchSummary.candidates) || []).slice();

  candidates = candidates.filter(function(c) {
    return c && c.warningReason !== 'upToDate';
  });

  if (!includeDuplicates) {
    candidates = candidates.filter(function(c) {
      return !(c && (c.contentHashDuplicate || c.warningReason === 'contentHashDuplicate'));
    });
  }

  if (onlyUncertain) {
    return candidates.filter(isUncertainAbcCandidate);
  }
  return candidates;
}

export function uncertainCandidatesForReview(batchSummary, options) {
  return reviewCandidatesFromBatch(batchSummary, Object.assign({}, options || {}, { onlyUncertain: true }));
}

/**
 * Filter importAbc raw buckets to only certain updates + inserts (no local/dups/fuzzy).
 * @param {object} raw - importAbc result
 * @param {Array} candidates - annotated classifier candidates
 */
export function filterCertainImportRaw(raw, candidates) {
  const source = raw || {};
  const list = Array.isArray(candidates) ? candidates : [];
  const certainInsertKeys = {};
  list.forEach(function(c) {
    if (!c || !c.tune) return;
    if (c.mergeStatus === 'new' && !c.mergeTargetId && !isUncertainAbcCandidate(c)) {
      certainInsertKeys[tuneKey(c.tune)] = true;
    }
  });

  // When candidates are annotated, only apply inserts still marked certain/new.
  // Without candidates (legacy), keep all inserts from raw.
  const inserts = list.length > 0
    ? asArray(source.inserts).filter(function(tune) {
      return certainInsertKeys[tuneKey(tune)];
    })
    : asArray(source.inserts);

  return Object.assign({}, source, {
    inserts: inserts,
    updates: asArray(source.updates),
    localUpdates: [],
    duplicates: [],
    skippedUpdates: [],
    deletes: source.deletes || {},
  });
}

export function certainApplyCounts(filteredRaw) {
  return {
    updates: asArray(filteredRaw && filteredRaw.updates).length,
    inserts: asArray(filteredRaw && filteredRaw.inserts).length,
    deletes: asArray(filteredRaw && filteredRaw.deletes).length,
  };
}

/**
 * Apply certain buckets via tunebook.applyImportData.
 * @returns {Promise<{ applied: object, remaining: Array }>}
 */
export function applyCertainFromAbcBatch(tunebook, batchSummary) {
  if (!tunebook || typeof tunebook.applyImportData !== 'function') {
    return Promise.reject(new Error('tunebook.applyImportData is required'));
  }
  const raw = (batchSummary && batchSummary.raw) || null;
  if (!raw) {
    return Promise.reject(new Error('batch summary raw buckets are required'));
  }
  const filtered = filterCertainImportRaw(raw, batchSummary.candidates || []);
  const counts = certainApplyCounts(filtered);
  const hasWork = counts.updates > 0 || counts.inserts > 0 || counts.deletes > 0;
  const remaining = uncertainCandidatesForReview(batchSummary, { includeDuplicates: true });

  if (!hasWork) {
    return Promise.resolve({ applied: counts, remaining: remaining, filtered: filtered });
  }

  return tunebook.applyImportData(filtered, false, false).then(function() {
    return { applied: counts, remaining: remaining, filtered: filtered };
  });
}
