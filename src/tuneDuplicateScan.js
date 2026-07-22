import { importHashIds } from './importDuplicateBooks';
import { cleanImportTitleForMatching, importTitlesMatchForDeduping, tuneImportTitle } from './importTitleMatch';
import { matchConfidenceLabel } from './tuneCollectionMatch';
import { scoreTuneMatch } from './voiceCommandUtils';
import { isDuplicatePairDismissed } from './tuneDuplicateDismissals';

const LARGE_CLUSTER_LIMIT = 6;
const SIMILAR_TITLE_MIN_SCORE = 8;
const CLUSTER_PAIR_YIELD_INTERVAL = 200;
const TITLE_BLOCK_PREFIX_LEN = 4;

function titleBlockKey(cleanTitle) {
  if (!cleanTitle) return '?';
  const tokens = cleanTitle.split(/\s+/).filter(Boolean);
  const significant = tokens.filter(function(token) {
    return token !== 'the' && token !== 'a' && token !== 'an';
  });
  const firstToken = significant[0] || tokens[0] || '?';
  const prefix = firstToken.slice(0, TITLE_BLOCK_PREFIX_LEN);
  const lengthBucket = Math.floor(cleanTitle.length / 6);
  return prefix + ':' + lengthBucket;
}

function buildTitleBlocks(tuneList) {
  const blocks = {};
  tuneList.forEach(function(tune) {
    const clean = cleanImportTitleForMatching(tuneImportTitle(tune));
    const key = titleBlockKey(clean);
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(tune);
  });
  return blocks;
}

function compareTunePairForCluster(a, b, union) {
  const cleanA = cleanImportTitleForMatching(tuneImportTitle(a));
  const cleanB = cleanImportTitleForMatching(tuneImportTitle(b));
  if (cleanA && cleanB && cleanA === cleanB) {
    union(a.id, b.id);
    return;
  }
  const scoreAB = scoreTuneMatch(tuneImportTitle(a), b);
  const scoreBA = scoreTuneMatch(tuneImportTitle(b), a);
  const score = Math.max(scoreAB, scoreBA);
  if (score >= SIMILAR_TITLE_MIN_SCORE) {
    union(a.id, b.id);
  }
}

export function yieldToMain() {
  return new Promise(function(resolve) {
    setTimeout(resolve, 0);
  });
}

function tuneListFromMap(tunes) {
  if (!tunes || typeof tunes !== 'object') return [];
  return Object.values(tunes).filter(function(tune) {
    return tune && tune.id;
  });
}

function groupLabelForTunes(tuneEntries) {
  const names = (tuneEntries || [])
    .map(function(entry) { return tuneImportTitle(entry.tune); })
    .filter(Boolean);
  if (names.length === 0) return 'Untitled';
  const unique = [];
  const seen = {};
  names.forEach(function(name) {
    const key = name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    unique.push(name);
  });
  if (unique.length === 1) return unique[0];
  return unique[0] + ' (+ ' + (unique.length - 1) + ' variant' + (unique.length - 1 === 1 ? '' : 's') + ')';
}

function buildGroupId(kind, tuneIds) {
  const sorted = tuneIds.slice().sort();
  return kind + ':' + sorted.join(',');
}

function pairPassesDismissalFilter(tuneA, tuneB, getTuneImportHash) {
  if (!tuneA || !tuneB || !getTuneImportHash) return true;
  const hashA = getTuneImportHash(tuneA);
  const hashB = getTuneImportHash(tuneB);
  return !isDuplicatePairDismissed(tuneA.id, tuneB.id, hashA, hashB);
}

function filterDismissedPairs(tuneIds, tunes, getTuneImportHash) {
  const activeIds = [];
  (tuneIds || []).forEach(function(id) {
    if (!id || !tunes[id]) return;
    let dismissedAgainstAll = true;
    for (let i = 0; i < activeIds.length; i += 1) {
      if (pairPassesDismissalFilter(tunes[id], tunes[activeIds[i]], getTuneImportHash)) {
        dismissedAgainstAll = false;
        break;
      }
    }
    if (!dismissedAgainstAll || activeIds.length === 0) {
      activeIds.push(id);
    }
  });
  // Re-check: remove ids where every pair with remaining ids is dismissed
  const kept = [];
  activeIds.forEach(function(id) {
    const tune = tunes[id];
    const hasUndismissedPair = kept.some(function(otherId) {
      return pairPassesDismissalFilter(tune, tunes[otherId], getTuneImportHash);
    });
    if (kept.length === 0 || hasUndismissedPair) {
      kept.push(id);
    }
  });
  return kept.length >= 2 ? kept : [];
}

/**
 * Tier 1: same import hash + matching titles.
 */
export function scanExactContentDuplicates(options) {
  const opts = options || {};
  const tunes = opts.tunes || {};
  const tunesHash = opts.tunesHash || {};
  const getTuneImportHash = opts.getTuneImportHash;
  const importhashes = tunesHash.importhashes || {};
  const groups = [];
  const seenGroupKeys = {};

  Object.keys(importhashes).forEach(function(hash) {
    const ids = importHashIds(importhashes, hash).filter(function(id) {
      return tunes[id];
    });
    if (ids.length < 2) return;

    const matchingIds = [];
    ids.forEach(function(id) {
      const tune = tunes[id];
      const matchesSome = ids.some(function(otherId) {
        if (otherId === id) return false;
        const other = tunes[otherId];
        return importTitlesMatchForDeduping(tuneImportTitle(tune), tuneImportTitle(other));
      });
      if (matchesSome) matchingIds.push(id);
    });

    const uniqueIds = Array.from(new Set(matchingIds));
    if (uniqueIds.length < 2) return;

    const filteredIds = filterDismissedPairs(uniqueIds, tunes, getTuneImportHash);
    if (filteredIds.length < 2) return;

    const groupKey = buildGroupId('exact', filteredIds);
    if (seenGroupKeys[groupKey]) return;
    seenGroupKeys[groupKey] = true;

    const tuneEntries = filteredIds.map(function(id) {
      return { id: id, tune: tunes[id] };
    });

    groups.push({
      id: groupKey,
      kind: 'exactContent',
      confidence: 'Exact',
      label: groupLabelForTunes(tuneEntries),
      tuneIds: filteredIds,
      tunes: tuneEntries,
      largeGroup: false,
    });
  });

  return groups;
}

function buildTitleClusters(tunes) {
  const tuneList = tuneListFromMap(tunes);
  const byCleanTitle = {};

  tuneList.forEach(function(tune) {
    const clean = cleanImportTitleForMatching(tuneImportTitle(tune));
    if (!clean) return;
    if (!byCleanTitle[clean]) byCleanTitle[clean] = [];
    byCleanTitle[clean].push(tune);
  });

  const parent = {};
  tuneList.forEach(function(tune) {
    parent[tune.id] = tune.id;
  });

  function find(id) {
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  Object.keys(byCleanTitle).forEach(function(clean) {
    const list = byCleanTitle[clean];
    if (list.length < 2) return;
    for (let i = 1; i < list.length; i += 1) {
      union(list[0].id, list[i].id);
    }
  });

  const blocks = buildTitleBlocks(tuneList);
  Object.keys(blocks).forEach(function(blockKey) {
    const blockTunes = blocks[blockKey];
    for (let i = 0; i < blockTunes.length; i += 1) {
      for (let j = i + 1; j < blockTunes.length; j += 1) {
        compareTunePairForCluster(blockTunes[i], blockTunes[j], union);
      }
    }
  });

  const clusters = {};
  tuneList.forEach(function(tune) {
    const root = find(tune.id);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(tune);
  });

  Object.keys(byCleanTitle).forEach(function(clean) {
    const list = byCleanTitle[clean];
    if (list.length < 2) return;
    list.forEach(function(tune) {
      const root = find(tune.id);
      if (!clusters[root]) clusters[root] = [];
      if (!clusters[root].some(function(t) { return t.id === tune.id; })) {
        clusters[root].push(tune);
      }
    });
  });

  return Object.values(clusters).filter(function(cluster) {
    return cluster.length >= 2;
  });
}

async function buildTitleClustersAsync(tunes, shouldCancel) {
  const tuneList = tuneListFromMap(tunes);
  const byCleanTitle = {};

  tuneList.forEach(function(tune) {
    const clean = cleanImportTitleForMatching(tuneImportTitle(tune));
    if (!clean) return;
    if (!byCleanTitle[clean]) byCleanTitle[clean] = [];
    byCleanTitle[clean].push(tune);
  });

  const parent = {};
  tuneList.forEach(function(tune) {
    parent[tune.id] = tune.id;
  });

  function find(id) {
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  let pairCount = 0;
  Object.keys(byCleanTitle).forEach(function(clean) {
    const list = byCleanTitle[clean];
    if (list.length < 2) return;
    for (let i = 1; i < list.length; i += 1) {
      union(list[0].id, list[i].id);
    }
  });

  const blocks = buildTitleBlocks(tuneList);
  const blockKeys = Object.keys(blocks);
  for (let bk = 0; bk < blockKeys.length; bk += 1) {
    if (shouldCancel()) return null;
    const blockTunes = blocks[blockKeys[bk]];
    for (let i = 0; i < blockTunes.length; i += 1) {
      if (shouldCancel()) return null;
      for (let j = i + 1; j < blockTunes.length; j += 1) {
        compareTunePairForCluster(blockTunes[i], blockTunes[j], union);
        pairCount += 1;
        if (pairCount >= CLUSTER_PAIR_YIELD_INTERVAL) {
          pairCount = 0;
          await yieldToMain();
          if (shouldCancel()) return null;
        }
      }
    }
  }

  const clusters = {};
  tuneList.forEach(function(tune) {
    const root = find(tune.id);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(tune);
  });

  Object.keys(byCleanTitle).forEach(function(clean) {
    const list = byCleanTitle[clean];
    if (list.length < 2) return;
    list.forEach(function(tune) {
      const root = find(tune.id);
      if (!clusters[root]) clusters[root] = [];
      if (!clusters[root].some(function(t) { return t.id === tune.id; })) {
        clusters[root].push(tune);
      }
    });
  });

  return Object.values(clusters).filter(function(cluster) {
    return cluster.length >= 2;
  });
}

/**
 * Tier 2: similar titles with different import hashes.
 */
function scanSimilarTitleDuplicatesFromClusters(options, clusters) {
  const opts = options || {};
  const tunes = opts.tunes || {};
  const getTuneImportHash = opts.getTuneImportHash;
  const exactGroupTuneIds = opts.exactGroupTuneIds || {};
  const groups = [];
  const seenGroupKeys = {};

  if (!clusters) return groups;

  clusters.forEach(function(cluster) {
    const tuneIds = cluster.map(function(t) { return t.id; });
    const hashById = {};
    cluster.forEach(function(tune) {
      hashById[tune.id] = typeof getTuneImportHash === 'function' ? getTuneImportHash(tune) : '';
    });

    // Need at least two tunes with different hashes (otherwise exact tier handles it)
    const uniqueHashes = {};
    cluster.forEach(function(tune) {
      const h = hashById[tune.id];
      if (h) uniqueHashes[h] = true;
    });
    if (Object.keys(uniqueHashes).length < 2) return;

    // Skip if entire cluster is already in an exact group
    const allInExact = tuneIds.every(function(id) { return exactGroupTuneIds[id]; });
    if (allInExact) return;

    const filteredIds = filterDismissedPairs(tuneIds, tunes, getTuneImportHash);
    if (filteredIds.length < 2) return;

    const groupKey = buildGroupId('similar', filteredIds);
    if (seenGroupKeys[groupKey]) return;
    seenGroupKeys[groupKey] = true;

    const tuneEntries = filteredIds.map(function(id) {
      return { id: id, tune: tunes[id] };
    });

    let maxScore = 0;
    for (let i = 0; i < tuneEntries.length; i += 1) {
      for (let j = i + 1; j < tuneEntries.length; j += 1) {
        const a = tuneEntries[i].tune;
        const b = tuneEntries[j].tune;
        const score = Math.max(
          scoreTuneMatch(tuneImportTitle(a), b),
          scoreTuneMatch(tuneImportTitle(b), a)
        );
        if (score > maxScore) maxScore = score;
      }
    }

    const largeGroup = filteredIds.length > LARGE_CLUSTER_LIMIT;

    groups.push({
      id: groupKey,
      kind: 'similarTitle',
      confidence: matchConfidenceLabel(maxScore, false) || 'Approximate',
      label: groupLabelForTunes(tuneEntries),
      tuneIds: filteredIds,
      tunes: tuneEntries,
      largeGroup: largeGroup,
    });
  });

  return groups;
}

export function scanSimilarTitleDuplicates(options) {
  const opts = options || {};
  const clusters = buildTitleClusters(opts.tunes || {});
  return scanSimilarTitleDuplicatesFromClusters(opts, clusters);
}

export async function scanSimilarTitleDuplicatesAsync(options) {
  const opts = options || {};
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : function() { return false; };
  const clusters = await buildTitleClustersAsync(opts.tunes || {}, shouldCancel);
  if (clusters === null || shouldCancel()) return null;
  return scanSimilarTitleDuplicatesFromClusters(opts, clusters);
}

/**
 * Full library scan for duplicate groups.
 */
export function scanDuplicateGroups(options) {
  const opts = options || {};
  const tunes = opts.tunes || {};
  const tunesHash = opts.tunesHash || {};
  const getTuneImportHash = opts.getTuneImportHash;

  const exactGroups = scanExactContentDuplicates({
    tunes: tunes,
    tunesHash: tunesHash,
    getTuneImportHash: getTuneImportHash,
  });

  const exactGroupTuneIds = {};
  exactGroups.forEach(function(group) {
    (group.tuneIds || []).forEach(function(id) {
      exactGroupTuneIds[id] = true;
    });
  });

  const similarGroups = scanSimilarTitleDuplicates({
    tunes: tunes,
    getTuneImportHash: getTuneImportHash,
    exactGroupTuneIds: exactGroupTuneIds,
  });

  const all = exactGroups.concat(similarGroups);
  all.sort(function(a, b) {
    if (a.kind !== b.kind) {
      return a.kind === 'exactContent' ? -1 : 1;
    }
    return String(a.label || '').localeCompare(String(b.label || ''));
  });

  return {
    groups: all,
    exactCount: exactGroups.length,
    similarCount: similarGroups.length,
  };
}

export async function scanDuplicateGroupsAsync(options) {
  const opts = options || {};
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : function() { return false; };

  const exactGroups = scanExactContentDuplicates(opts);
  if (shouldCancel()) return null;

  await yieldToMain();
  if (shouldCancel()) return null;

  const exactGroupTuneIds = {};
  exactGroups.forEach(function(group) {
    (group.tuneIds || []).forEach(function(id) {
      exactGroupTuneIds[id] = true;
    });
  });

  const similarGroups = await scanSimilarTitleDuplicatesAsync(Object.assign({}, opts, {
    exactGroupTuneIds: exactGroupTuneIds,
    shouldCancel: shouldCancel,
  }));
  if (similarGroups === null || shouldCancel()) return null;

  const all = exactGroups.concat(similarGroups);
  all.sort(function(a, b) {
    if (a.kind !== b.kind) {
      return a.kind === 'exactContent' ? -1 : 1;
    }
    return String(a.label || '').localeCompare(String(b.label || ''));
  });

  return {
    groups: all,
    exactCount: exactGroups.length,
    similarCount: similarGroups.length,
  };
}

export function filterDuplicateGroupsByKind(groups, kind) {
  if (!kind || kind === 'all') return groups || [];
  return (groups || []).filter(function(group) {
    return group.kind === kind;
  });
}
