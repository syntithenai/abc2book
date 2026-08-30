export const TUNE_IMPORT_FIELD_DEFS = [
  { key: 'name', label: 'Title', group: 'ABC metadata', defaultImport: true },
  { key: 'composer', label: 'Composer', group: 'ABC metadata', defaultImport: true },
  { key: 'artists', label: 'Artists', group: 'ABC metadata', defaultImport: true },
  { key: 'genres', label: 'Genres', group: 'ABC metadata', defaultImport: true },
  { key: 'rhythm', label: 'Rhythm', group: 'ABC metadata', defaultImport: true },
  { key: 'meter', label: 'Time signature', group: 'ABC metadata', defaultImport: true },
  { key: 'noteLength', label: 'Note length', group: 'ABC metadata', defaultImport: true },
  { key: 'key', label: 'Key', group: 'ABC metadata', defaultImport: true },
  { key: 'tempo', label: 'Tempo', group: 'ABC metadata', defaultImport: true },
  { key: 'aliases', label: 'Aliases', group: 'ABC metadata', defaultImport: true },
  { key: 'origin', label: 'Origin', group: 'ABC metadata', defaultImport: true },
  { key: 'area', label: 'Area', group: 'ABC metadata', defaultImport: true },
  { key: 'source', label: 'Source', group: 'ABC metadata', defaultImport: true },
  { key: 'sourceBooks', label: 'Source book(s)', group: 'ABC metadata', defaultImport: true },
  { key: 'transcription', label: 'Transcription', group: 'ABC metadata', defaultImport: true },
  { key: 'discography', label: 'Discography', group: 'ABC metadata', defaultImport: true },
  { key: 'infoNotes', label: 'Notes (N:)', group: 'ABC metadata', defaultImport: true },
  { key: 'meta', label: 'Other ABC metadata', group: 'ABC metadata', defaultImport: true },
  { key: 'abccomments', label: 'ABC comments', group: 'ABC metadata', defaultImport: false },
  { key: 'voices', label: 'Music (notation)', group: 'Music', defaultImport: true },
  { key: 'words', label: 'Lyrics (W: fields)', group: 'Lyrics', defaultImport: true },
  { key: 'wLines', label: 'Lyrics (w: fields)', group: 'Lyrics', defaultImport: true },
  { key: 'books', label: 'Tunebooks', group: 'Collection data', defaultImport: false },
  { key: 'tags', label: 'Tags', group: 'Collection data', defaultImport: false },
  { key: 'albums', label: 'Albums', group: 'Collection data', defaultImport: false },
  { key: 'links', label: 'Links', group: 'Collection data', defaultImport: false },
  { key: 'boost', label: 'Confidence', group: 'Playback & extras', defaultImport: false },
  { key: 'difficulty', label: 'Difficulty', group: 'Playback & extras', defaultImport: false },
  { key: 'tablature', label: 'Tablature', group: 'Playback & extras', defaultImport: false },
  { key: 'capo', label: 'Capo', group: 'Playback & extras', defaultImport: false },
  { key: 'playbackTempo', label: 'Playback tempo', group: 'Playback & extras', defaultImport: false },
  { key: 'playbackPitch', label: 'Playback transpose', group: 'Playback & extras', defaultImport: false },
  { key: 'playbackFineTune', label: 'Playback fine tune', group: 'Playback & extras', defaultImport: false },
  { key: 'playbackAudioFilters', label: 'Playback audio filters', group: 'Playback & extras', defaultImport: false },
  { key: 'transpose', label: 'Transpose', group: 'Playback & extras', defaultImport: false },
  { key: 'tuning', label: 'Tuning', group: 'Playback & extras', defaultImport: false },
  { key: 'soundFonts', label: 'Sound fonts', group: 'Playback & extras', defaultImport: false },
  { key: 'repeats', label: 'Repeats', group: 'Playback & extras', defaultImport: false },
  { key: 'timingScaffold', label: 'Timing scaffold', group: 'Playback & extras', defaultImport: false },
  { key: 'backgroundInfo', label: 'Background info', group: 'Playback & extras', defaultImport: false },
  { key: 'srcUrl', label: 'Source URL', group: 'Playback & extras', defaultImport: false },
  { key: 'composerId', label: 'Artist ID', group: 'Playback & extras', defaultImport: false },
  { key: 'notes', label: 'Legacy notes', group: 'Music', defaultImport: false },
];

const FIELD_DEF_BY_KEY = {};
TUNE_IMPORT_FIELD_DEFS.forEach(function(def) {
  FIELD_DEF_BY_KEY[def.key] = def;
});

const RESERVED_KEYS = { id: true, lastUpdated: true, lastHash: true };

/** Collection fields always union on duplicate merge — never replaced from field checkboxes. */
export const DUPLICATE_MERGE_ALWAYS_UNION_KEYS = {
  books: true,
  tags: true,
  links: true,
  tuneFiles: true,
};

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  if (typeof value === 'number' && value === 0) return false;
  if (typeof value === 'boolean') return false;
  return false;
}

function countVoiceLines(voices) {
  if (!voices || typeof voices !== 'object') return 0;
  return Object.keys(voices).reduce(function(total, voiceKey) {
    const voice = voices[voiceKey];
    const noteCount = voice && Array.isArray(voice.notes) ? voice.notes.length : 0;
    return total + noteCount;
  }, 0);
}

function isDefaultEmptyImportedField(fieldKey, value) {
  if (value === null || value === undefined) return true;
  if (fieldKey === 'tempo' && value === 100) return true;
  if (fieldKey === 'boost' && value === 0) return true;
  if (fieldKey === 'capo' && value === 0) return true;
  if (fieldKey === 'playbackTempo' && value === 1) return true;
  if (fieldKey === 'playbackPitch' && value === 0) return true;
  if (fieldKey === 'playbackFineTune' && value === 0) return true;
  if (fieldKey === 'timingScaffold' && value === false) return true;
  if (fieldKey === 'backgroundInfo' && value === '') return true;
  if (fieldKey === 'voices' && countVoiceLines(value) === 0) return true;
  return isEmptyValue(value);
}

export function importedFieldIsPresent(fieldKey, value) {
  if (RESERVED_KEYS[fieldKey]) return false;
  return !isDefaultEmptyImportedField(fieldKey, value);
}

export function tuneFieldValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function extractYoutubeVideoId(url) {
  if (!url) return '';
  const match = String(url).trim().match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i
  );
  return match ? match[1].toLowerCase() : '';
}

function normalizeLinkUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const youtubeId = extractYoutubeVideoId(trimmed);
  if (youtubeId) return 'youtube:' + youtubeId;
  return trimmed.replace(/\/$/, '').toLowerCase();
}

export function linkCompareKey(link) {
  if (!link || !link.link) return '';
  const urlKey = normalizeLinkUrl(link.link);
  const title = String(link.title || link.name || '').trim().toLowerCase();
  const startAt = link.startAt != null && link.startAt !== '' ? String(link.startAt) : '';
  const endAt = link.endAt != null && link.endAt !== '' ? String(link.endAt) : '';
  return [urlKey, title, startAt, endAt].join('|');
}

export function tuneLinksEqual(a, b) {
  const keysA = (Array.isArray(a) ? a : []).map(linkCompareKey).filter(Boolean).sort();
  const keysB = (Array.isArray(b) ? b : []).map(linkCompareKey).filter(Boolean).sort();
  return JSON.stringify(keysA) === JSON.stringify(keysB);
}

/** Meta keys that are device-local or derived — not meaningful merge conflicts. */
const INTERNAL_META_KEYS = {
  X: true,
  chordBlockCache: true,
};

function stripAbcIndexKeys(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const stripped = {};
  Object.keys(meta).forEach(function(key) {
    if (!INTERNAL_META_KEYS[key]) stripped[key] = meta[key];
  });
  return stripped;
}

export function metaDiffAutoAccept(originalValue, importedValue) {
  if (!importedValue || typeof importedValue !== 'object') return false;
  return JSON.stringify(stripAbcIndexKeys(originalValue)) === JSON.stringify(stripAbcIndexKeys(importedValue));
}

export function fieldValuesSemanticallyEqual(fieldKey, originalValue, importedValue) {
  if (fieldKey === 'links') return tuneLinksEqual(originalValue, importedValue);
  if (fieldKey === 'meta') return metaDiffAutoAccept(originalValue, importedValue);
  return tuneFieldValuesEqual(originalValue, importedValue);
}

export function getAutoAppliedImportFieldKeys(originalTune, importedTune) {
  const autoKeys = [];
  if (!importedTune) return autoKeys;
  if (importedTune.hasOwnProperty('meta') && metaDiffAutoAccept(
    originalTune ? originalTune.meta : undefined,
    importedTune.meta
  ) && !tuneFieldValuesEqual(originalTune ? originalTune.meta : undefined, importedTune.meta)) {
    autoKeys.push('meta');
  }
  return autoKeys;
}

function formatLinkEntry(link) {
  if (!link || !link.link) return null;
  const title = String(link.title || link.name || '').trim();
  const url = String(link.link).trim();
  const regionParts = [];
  if (link.startAt != null && link.startAt !== '') regionParts.push('start ' + link.startAt);
  if (link.endAt != null && link.endAt !== '') regionParts.push('end ' + link.endAt);
  let line = title ? title + ': ' + url : url;
  if (regionParts.length) line += ' (' + regionParts.join(', ') + ')';
  return line;
}

function formatLinksForDisplay(links) {
  if (!Array.isArray(links) || links.length === 0) return '—';
  const lines = links.map(formatLinkEntry).filter(Boolean);
  return lines.length ? lines.join('\n') : '—';
}

export function formatTuneFieldValue(fieldKey, value) {
  if (isEmptyValue(value)) return '—';
  if (fieldKey === 'voices') {
    const voiceCount = Object.keys(value).length;
    const lineCount = countVoiceLines(value);
    return voiceCount + ' voice' + (voiceCount === 1 ? '' : 's') + ', ' + lineCount + ' line' + (lineCount === 1 ? '' : 's');
  }
  if (fieldKey === 'links') {
    return formatLinksForDisplay(value);
  }
  if (fieldKey === 'files' || fieldKey === 'recordings') {
    return (Array.isArray(value) ? value.length : 0) + ' item' + (value.length === 1 ? '' : 's');
  }
  if (fieldKey === 'books' || fieldKey === 'tags' || fieldKey === 'aliases' || fieldKey === 'artists' || fieldKey === 'albums' || fieldKey === 'genres') {
    return Array.isArray(value) ? value.join(', ') : String(value);
  }
  if (fieldKey === 'words' || fieldKey === 'wLines') {
    const lines = Array.isArray(value) ? value : [];
    const preview = lines.slice(0, 3).join(' / ');
    return lines.length > 3 ? preview + ' … (' + lines.length + ' lines)' : preview;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 120 ? json.slice(0, 117) + '…' : json;
  }
  return String(value);
}

function humanizeFieldKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, function(ch) { return ch.toUpperCase(); });
}

function getFieldDef(key) {
  if (FIELD_DEF_BY_KEY[key]) return FIELD_DEF_BY_KEY[key];
  return {
    key: key,
    label: humanizeFieldKey(key),
    group: 'Other',
    defaultImport: false,
  };
}

function collectImportedFieldKeys(importedTune) {
  if (!importedTune) return [];
  return Object.keys(importedTune).filter(function(key) {
    return importedFieldIsPresent(key, importedTune[key]);
  });
}

function collectDuplicateMergeFieldKeys(survivorTune, incomingTune) {
  const keys = {};
  [survivorTune, incomingTune].forEach(function(tune) {
    collectImportedFieldKeys(tune).forEach(function(key) {
      if (!DUPLICATE_MERGE_ALWAYS_UNION_KEYS[key] && !RESERVED_KEYS[key]) {
        keys[key] = true;
      }
    });
  });
  return Object.keys(keys);
}

function buildFieldRow(key, originalTune, importedTune) {
  const originalValue = originalTune ? originalTune[key] : undefined;
  const importedValue = importedTune ? importedTune[key] : undefined;
  const def = getFieldDef(key);
  return {
    key: key,
    label: def.label,
    group: def.group,
    defaultImport: def.defaultImport,
    originalValue: originalValue,
    importedValue: importedValue,
    originalDisplay: formatTuneFieldValue(key, originalValue),
    importedDisplay: formatTuneFieldValue(key, importedValue),
    differs: !fieldValuesSemanticallyEqual(key, originalValue, importedValue),
    autoApply: getAutoAppliedImportFieldKeys(originalTune, importedTune).indexOf(key) >= 0,
  };
}

function sortFieldRows(rows) {
  const groupOrder = ['ABC metadata', 'Music', 'Lyrics', 'Collection data', 'Playback & extras', 'Other'];
  rows.sort(function(a, b) {
    const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
    if (groupDiff !== 0) return groupDiff;
    return a.label.localeCompare(b.label);
  });
  return rows;
}

export function tuneHasNotationContent(tune) {
  if (!tune) return false;
  if (importedFieldIsPresent('voices', tune.voices)) return true;
  if (tune.notes != null && String(tune.notes).trim()) return true;
  return false;
}

export function tunePairHasDifferingImportFields(localTune, incomingTune) {
  return buildTuneImportFieldRows(localTune, incomingTune).some(function(row) {
    return row.differs;
  });
}

export function buildTuneImportFieldRows(originalTune, importedTune) {
  const rows = [];
  collectImportedFieldKeys(importedTune).forEach(function(key) {
    rows.push(buildFieldRow(key, originalTune, importedTune));
  });
  return sortFieldRows(rows);
}

/**
 * Duplicate merge compares fields present on either tune (except collection data, which always unions).
 */
export function buildDuplicateMergeFieldRows(survivorTune, incomingTune) {
  const rows = [];
  collectDuplicateMergeFieldKeys(survivorTune, incomingTune).forEach(function(key) {
    rows.push(buildFieldRow(key, survivorTune, incomingTune));
  });
  return sortFieldRows(rows);
}

export function buildDefaultTuneImportSelections(rows) {
  const selections = {};
  (rows || []).forEach(function(row) {
    selections[row.key] = row.defaultImport;
  });
  return selections;
}

/** Duplicate merge keeps the survivor unless the user explicitly checks a field. */
export function buildDefaultDuplicateMergeSelections(rows) {
  const selections = {};
  (rows || []).forEach(function(row) {
    selections[row.key] = false;
  });
  return selections;
}

export function filterDuplicateMergeFieldSelections(selections) {
  const filtered = {};
  Object.keys(selections || {}).forEach(function(key) {
    if (!DUPLICATE_MERGE_ALWAYS_UNION_KEYS[key]) {
      filtered[key] = selections[key];
    }
  });
  return filtered;
}

export function applyTuneImportSelections(originalTune, importedTune, selections) {
  const merged = cloneValue(originalTune || {});
  merged.id = originalTune && originalTune.id ? originalTune.id : merged.id;

  buildTuneImportFieldRows(originalTune, importedTune).forEach(function(row) {
    if (selections && selections[row.key] && importedTune && importedTune.hasOwnProperty(row.key)) {
      merged[row.key] = cloneValue(importedTune[row.key]);
    }
  });

  getAutoAppliedImportFieldKeys(originalTune, importedTune).forEach(function(key) {
    if (importedTune && importedTune.hasOwnProperty(key)) {
      merged[key] = cloneValue(importedTune[key]);
    }
  });

  return merged;
}

export function applyDuplicateMergeSelections(survivorTune, incomingTune, selections) {
  const merged = cloneValue(survivorTune || {});
  merged.id = survivorTune && survivorTune.id ? survivorTune.id : merged.id;
  const filtered = filterDuplicateMergeFieldSelections(selections);

  buildDuplicateMergeFieldRows(survivorTune, incomingTune).forEach(function(row) {
    if (filtered[row.key] && incomingTune && incomingTune.hasOwnProperty(row.key)) {
      merged[row.key] = cloneValue(incomingTune[row.key]);
    }
  });

  getAutoAppliedImportFieldKeys(survivorTune, incomingTune).forEach(function(key) {
    if (DUPLICATE_MERGE_ALWAYS_UNION_KEYS[key]) return;
    if (incomingTune && incomingTune.hasOwnProperty(key)) {
      merged[key] = cloneValue(incomingTune[key]);
    }
  });

  return merged;
}

export function setAllTuneImportSelections(rows, selected) {
  const next = {};
  (rows || []).forEach(function(row) {
    next[row.key] = selected;
  });
  return next;
}

export function setRecommendedTuneImportSelections(rows) {
  return buildDefaultTuneImportSelections(rows);
}

export function setRecommendedDuplicateMergeSelections(rows) {
  return buildDefaultDuplicateMergeSelections(rows);
}
