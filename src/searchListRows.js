import { expandPdfSnapshotSearchRows } from './pdfSnapshotIndex';

export function tuneRowsFromTunes(tunes, filterText) {
  const list = Array.isArray(tunes) ? tunes : [];
  return expandPdfSnapshotSearchRows(list, filterText).map(function(row) {
    return Object.assign({ kind: 'tune' }, row);
  });
}

export function mediaRowsFromCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.map(function(candidate, index) {
    if (!candidate) return null;
    return {
      kind: 'media',
      candidate: candidate,
      mediaIndex: index,
    };
  }).filter(Boolean);
}

export function mergeSearchListRows(tuneRows, mediaCandidates, options) {
  const opts = options || {};
  const tunes = Array.isArray(tuneRows) ? tuneRows : [];
  const includeMedia = opts.includeMedia !== false;
  const media = includeMedia ? mediaRowsFromCandidates(mediaCandidates) : [];
  return tunes.concat(media);
}

export function getSearchRowKey(row, index) {
  const idx = typeof index === 'number' ? index : 0;
  if (!row) return 'row-' + idx;
  if (row.kind === 'media' && row.candidate) {
    const candidate = row.candidate;
    return [
      'media',
      candidate.source || 'media',
      candidate.id || candidate.uri || candidate.link || candidate.path || candidate.title || idx,
    ].join(':');
  }
  const tune = row.tune;
  const snapshot = row.snapshotMatch;
  if (!tune || !tune.id) return 'tune-' + idx;
  return [
    'tune',
    tune.id,
    snapshot && snapshot.page != null ? snapshot.page : 'main',
    snapshot && snapshot.matchKind ? snapshot.matchKind : '',
  ].join(':');
}

export function isMediaSearchRow(row) {
  return !!(row && row.kind === 'media' && row.candidate);
}

export function isTuneSearchRow(row) {
  return !!(row && row.kind === 'tune' && row.tune && row.tune.id);
}
