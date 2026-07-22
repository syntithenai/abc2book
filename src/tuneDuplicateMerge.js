import { applyTuneImportSelections } from './tuneImportMergeUtils';
import { mergeTuneCollectionExtras } from './tuneMergeExtras';
import { clearDuplicateDismissalsForTuneIds } from './tuneDuplicateDismissals';

function cloneTune(tune) {
  return JSON.parse(JSON.stringify(tune || {}));
}

/**
 * Pick default survivor: tune with most books/links, then oldest lastUpdated.
 */
export function pickDefaultSurvivorId(tuneIds, tunes) {
  const ids = (Array.isArray(tuneIds) ? tuneIds : []).filter(function(id) {
    return tunes && tunes[id];
  });
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];

  let bestId = ids[0];
  let bestScore = -1;
  ids.forEach(function(id) {
    const tune = tunes[id];
    const bookCount = Array.isArray(tune.books) ? tune.books.length : 0;
    const linkCount = Array.isArray(tune.links) ? tune.links.length : 0;
    const fileCount = Array.isArray(tune.tuneFiles) ? tune.tuneFiles.length : 0;
    const score = bookCount * 10 + linkCount * 5 + fileCount;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
      return;
    }
    if (score === bestScore) {
      const bestUpdated = tunes[bestId].lastUpdated || 0;
      const currentUpdated = tune.lastUpdated || 0;
      if (currentUpdated < bestUpdated) bestId = id;
    }
  });
  return bestId;
}

/**
 * Fold one incoming tune into survivor using field selections.
 */
export function mergeTunesIntoSurvivor(survivor, incoming, fieldSelections) {
  if (!survivor || !incoming) return survivor;

  let merged = applyTuneImportSelections(survivor, incoming, fieldSelections || {});
  merged.id = survivor.id;
  mergeTuneCollectionExtras(merged, survivor, incoming);
  merged.lastUpdated = Date.now();
  return merged;
}

/**
 * Quick merge for exact duplicates: keep survivor ABC, union books/tags/links.
 */
export function quickMergeExactDuplicates(survivor, incomingList) {
  if (!survivor) return null;
  let merged = cloneTune(survivor);
  const sources = [survivor].concat(Array.isArray(incomingList) ? incomingList : []);
  mergeTuneCollectionExtras.apply(null, [merged].concat(sources.filter(Boolean)));
  merged.lastUpdated = Date.now();
  return merged;
}

/**
 * Apply a duplicate merge via tunebook APIs.
 *
 * @param {object} options
 * @param {object} options.tunebook
 * @param {object} options.tunes
 * @param {string} options.survivorId
 * @param {string[]} options.duplicateIds
 * @param {object} [options.fieldSelectionsByTuneId] map duplicateId -> selections
 * @param {boolean} [options.quickMerge]
 */
export function applyDuplicateMerge(options) {
  const opts = options || {};
  const tunebook = opts.tunebook;
  const tunes = opts.tunes || {};
  const survivorId = opts.survivorId;
  const duplicateIds = (opts.duplicateIds || []).filter(function(id) {
    return id && id !== survivorId && tunes[id];
  });
  if (!tunebook || !survivorId || !tunes[survivorId]) {
    return { ok: false, error: 'Missing survivor tune' };
  }

  let survivor = cloneTune(tunes[survivorId]);
  const incomingList = duplicateIds.map(function(id) { return tunes[id]; });

  if (opts.quickMerge) {
    survivor = quickMergeExactDuplicates(survivor, incomingList);
  } else {
    const selectionsById = opts.fieldSelectionsByTuneId || {};
    incomingList.forEach(function(incoming) {
      survivor = mergeTunesIntoSurvivor(
        survivor,
        incoming,
        selectionsById[incoming.id] || {}
      );
    });
  }

  tunebook.saveTune(survivor, false, { historyLabel: 'Duplicate merge' });
  if (duplicateIds.length > 0) {
    tunebook.deleteTunes(duplicateIds);
  }
  clearDuplicateDismissalsForTuneIds([survivorId].concat(duplicateIds));
  if (typeof tunebook.buildTunesHash === 'function') {
    tunebook.buildTunesHash();
  }

  return { ok: true, survivorId: survivorId, deletedIds: duplicateIds };
}
