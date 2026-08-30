/**
 * Map tunebook.importAbc() buckets to import-review candidate metadata.
 * Identity truth for tunebook-authored ABC (id + lastUpdated).
 */

import { createImportCandidate } from './importReviewSession';
import { applyIntakePolicyToCandidates } from './importIntakePolicy';
import { findCollectionMatches } from './tuneCollectionMatch';
import { primaryArtist } from './tuneBibliographicUtils';
import { importTitlesMatchForDeduping, tuneImportTitle } from './importTitleMatch';
import { importLyricsMatchForDeduping } from './importLyricsMatch';

function asArray(bucket) {
  if (!bucket) return [];
  if (Array.isArray(bucket)) return bucket;
  if (typeof bucket === 'object') {
    return Object.keys(bucket).map(function(key) { return bucket[key]; });
  }
  return [];
}

function mapTune(tune, fields) {
  const base = createImportCandidate(Object.assign({
    tune: tune,
    sourceKind: 'abc',
    skipEnrich: true,
  }, fields || {}));
  if (tune && tune.id && fields && fields.mergeTargetId == null && fields.mergeStatus === 'exactId') {
    base.mergeTargetId = tune.id;
  }
  return base;
}

/**
 * @param {object} importResults - return value of tunebook.importAbc()
 * @param {object} [options]
 * @returns {{ candidates: Array, deletes: Array, summary: object, raw: object }}
 */
export function classifyImportAbcResults(importResults, options) {
  const results = importResults || {};
  const opts = options || {};
  const includeSkipped = !!opts.includeSkipped;
  const candidates = [];

  asArray(results.updates).forEach(function(tune) {
    candidates.push(mapTune(tune, {
      mergeTargetId: tune && tune.id ? tune.id : null,
      mergeStatus: 'exactId',
      mergeMode: 'direct',
      warningReason: null,
    }));
  });

  asArray(results.localUpdates).forEach(function(tune) {
    candidates.push(mapTune(tune, {
      mergeTargetId: tune && tune.id ? tune.id : null,
      mergeStatus: 'exactId',
      mergeMode: 'suggestOnly',
      warningReason: 'localNewer',
    }));
  });

  asArray(results.inserts).forEach(function(tune) {
    const hasId = !!(tune && tune.id);
    candidates.push(mapTune(tune, {
      mergeTargetId: null,
      mergeStatus: hasId ? 'new' : 'new',
      mergeMode: 'suggestOnly',
      warningReason: null,
    }));
  });

  asArray(results.duplicates).forEach(function(tune) {
    candidates.push(mapTune(tune, {
      mergeTargetId: null,
      mergeStatus: 'exactHash',
      mergeMode: 'suggestOnly',
      warningReason: 'contentHashDuplicate',
      contentHashDuplicate: true,
    }));
  });

  if (includeSkipped) {
    asArray(results.skippedUpdates).forEach(function(tune) {
      candidates.push(mapTune(tune, {
        mergeTargetId: tune && tune.id ? tune.id : null,
        mergeStatus: 'exactId',
        mergeMode: 'suggestOnly',
        warningReason: 'upToDate',
      }));
    });
  }

  const deletes = asArray(results.deletes).map(function(tune) {
    return {
      tune: tune,
      mergeStatus: 'delete',
      warningReason: 'remoteDeleted',
    };
  });

  const annotated = applyIntakePolicyToCandidates(candidates);

  const summary = {
    inserts: asArray(results.inserts).length,
    updates: asArray(results.updates).length,
    localUpdates: asArray(results.localUpdates).length,
    skippedUpdates: asArray(results.skippedUpdates).length,
    duplicates: asArray(results.duplicates).length,
    deletes: deletes.length,
    candidateCount: annotated.length,
  };

  return {
    candidates: annotated,
    deletes: deletes,
    summary: summary,
    raw: results,
    tuneStatus: results.tuneStatus || null,
  };
}

/**
 * For new inserts, attach Exact/Likely library matches so they require review.
 * @param {object} classified - classifyImportAbcResults result
 * @param {object} tunes - library tune map
 * @returns {object} classified with candidates possibly annotated
 */
export function annotateInsertsWithLibraryMatches(classified, tunes) {
  const source = classified || {};
  const library = tunes || {};
  const candidates = (source.candidates || []).map(function(candidate) {
    if (!candidate || candidate.mergeStatus !== 'new' || candidate.mergeTargetId) {
      return candidate;
    }
    const tune = candidate.tune || {};
    const matches = findCollectionMatches({
      title: tune.name || tune.title || '',
      artist: primaryArtist(tune) || tune.composer || '',
      tunes: library,
      importTune: tune,
      limit: 5,
    });
    const best = matches[0];
    if (best && best.tune && best.tune.id
      && (best.confidence === 'Exact' || best.confidence === 'Likely')
      && importTitlesMatchForDeduping(tuneImportTitle(tune), tuneImportTitle(best.tune))
      && importLyricsMatchForDeduping(tune, best.tune)) {
      return Object.assign({}, candidate, {
        mergeTargetId: best.tune.id,
        mergeStatus: 'titleMatch',
        mergeMode: 'suggestOnly',
        warningReason: 'libraryMatch',
        libraryMatchConfidence: best.confidence,
      });
    }
    return candidate;
  });

  const libraryMatchCount = candidates.filter(function(c) {
    return c && c.warningReason === 'libraryMatch';
  }).length;

  return Object.assign({}, source, {
    candidates: candidates,
    summary: Object.assign({}, source.summary || {}, {
      candidateCount: candidates.length,
      libraryMatches: libraryMatchCount,
    }),
  });
}

/**
 * Run importAbc on ABC text and classify into review candidates.
 * Uses classifyOnly so Add/file flows do not open ImportWarningDialog.
 */
export function classifyAbcTextForReview(tunebook, abcText, options) {
  if (!tunebook || typeof tunebook.importAbc !== 'function') {
    throw new Error('tunebook.importAbc is required');
  }
  const opts = options || {};
  const results = tunebook.importAbc(
    abcText,
    opts.forceBook || null,
    opts.limitToTuneId || null,
    opts.limitToBookName || null,
    opts.limitToTagName || null,
    opts.limitToTuneIds || null,
    {
      classifyOnly: true,
      personalFieldPolicy: opts.personalFieldPolicy || 'preserveLocal',
    }
  );
  let classified = classifyImportAbcResults(results, opts);
  if (opts.tunes) {
    classified = annotateInsertsWithLibraryMatches(classified, opts.tunes);
  }
  return classified;
}

export function buildBatchSummaryFromClassifier(classified) {
  const c = classified || {};
  const summary = c.summary || {};
  const raw = c.raw || {};
  return {
    inserts: asArray(raw.inserts),
    updates: asArray(raw.updates),
    localUpdates: asArray(raw.localUpdates),
    skippedUpdates: asArray(raw.skippedUpdates),
    duplicates: asArray(raw.duplicates),
    deletes: asArray(raw.deletes),
    counts: summary,
    tuneStatus: c.tuneStatus,
    candidates: c.candidates || [],
    raw: raw,
  };
}

/**
 * Whether ABC should show the batch summary panel (Apply vs Review) instead of
 * immediately opening per-tune review or inlining onto the Add form.
 *
 * Show for any existing-library work (updates, local-newer, duplicates, deletes,
 * title matches) — including a single update — so re-importing a fix ABC does
 * not dump the title into the blank Add form.
 * Brand-new single inserts stay inline-friendly (return false).
 */
export function shouldShowAbcBatchSummary(classified) {
  const summary = (classified && classified.summary) || {};
  const candidates = (classified && classified.candidates) || [];
  if (candidates.length > 1) return true;
  if ((summary.updates || 0) > 0) return true;
  if ((summary.localUpdates || 0) > 0) return true;
  if ((summary.duplicates || 0) > 0) return true;
  if ((summary.deletes || 0) > 0) return true;
  if ((summary.libraryMatches || 0) > 0) return true;
  if ((summary.inserts || 0) > 1) return true;
  return false;
}
