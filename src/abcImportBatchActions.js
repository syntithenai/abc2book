/**
 * Shared helpers for multi-tune ABC batch import (Google share + Add-from-file).
 */

import {
  importTitlesMatchForDeduping,
  preferCleanImportTitle,
  tuneImportTitle,
} from './importTitleMatch';

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

function unionStringLists() {
  const seen = {};
  const out = [];
  for (let a = 0; a < arguments.length; a += 1) {
    const list = arguments[a];
    (Array.isArray(list) ? list : []).forEach(function(item) {
      const text = String(item == null ? '' : item).trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(text);
    });
  }
  return out;
}

function tuneCompletenessScore(tune) {
  if (!tune) return 0;
  let score = 0;
  const notes = tune.voices && tune.voices['1'] && Array.isArray(tune.voices['1'].notes)
    ? tune.voices['1'].notes.join('\n')
    : (Array.isArray(tune.notes) ? tune.notes.join('\n') : String(tune.notes || ''));
  if (String(notes).trim().length > 20) score += 3;
  const lyrics = Array.isArray(tune.words) ? tune.words.join('\n') : String(tune.words || '');
  if (String(lyrics).trim().length > 20) score += 2;
  if (tune.key) score += 1;
  if (tune.composer) score += 1;
  return score;
}

/**
 * Within-batch dedupe of certain inserts that share a cleaned title (e.g. Help vs
 * Help ukulele version). Prefers the cleanest title and most complete content;
 * merges books/tags/aliases onto the winner.
 */
export function dedupeCertainInsertsByTitle(inserts) {
  const list = asArray(inserts);
  if (list.length < 2) return list.slice();

  const kept = [];

  list.forEach(function(tune) {
    if (!tune) return;
    const title = tuneImportTitle(tune);
    let matchIndex = -1;
    for (let i = 0; i < kept.length; i += 1) {
      if (importTitlesMatchForDeduping(title, tuneImportTitle(kept[i]))) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex < 0) {
      kept.push(tune);
      return;
    }

    const existing = kept[matchIndex];
    const preferredTitle = preferCleanImportTitle(tuneImportTitle(existing), title);
    const existingScore = tuneCompletenessScore(existing);
    const nextScore = tuneCompletenessScore(tune);
    const existingClean = preferCleanImportTitle(tuneImportTitle(existing), title) === tuneImportTitle(existing);
    const nextClean = preferCleanImportTitle(title, tuneImportTitle(existing)) === title;
    const preferNext = nextScore > existingScore
      || (nextScore === existingScore && nextClean && !existingClean);

    const winner = preferNext ? tune : existing;
    const loser = preferNext ? existing : tune;
    kept[matchIndex] = Object.assign({}, winner, {
      name: preferredTitle || winner.name || winner.title,
      books: unionStringLists(winner.books, loser.books),
      tags: unionStringLists(winner.tags, loser.tags),
      aliases: unionStringLists(
        winner.aliases,
        loser.aliases,
        loser.name && loser.name !== preferredTitle ? [loser.name] : []
      ),
    });
  });

  return kept;
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
  let inserts = list.length > 0
    ? asArray(source.inserts).filter(function(tune) {
      return certainInsertKeys[tuneKey(tune)];
    })
    : asArray(source.inserts);

  inserts = dedupeCertainInsertsByTitle(inserts);

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
