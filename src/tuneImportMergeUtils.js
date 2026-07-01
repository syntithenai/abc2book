export const TUNE_IMPORT_FIELD_DEFS = [
  { key: 'name', label: 'Title', group: 'ABC metadata', defaultImport: true },
  { key: 'composer', label: 'Composer', group: 'ABC metadata', defaultImport: true },
  { key: 'rhythm', label: 'Rhythm', group: 'ABC metadata', defaultImport: true },
  { key: 'meter', label: 'Time signature', group: 'ABC metadata', defaultImport: true },
  { key: 'noteLength', label: 'Note length', group: 'ABC metadata', defaultImport: true },
  { key: 'key', label: 'Key', group: 'ABC metadata', defaultImport: true },
  { key: 'tempo', label: 'Tempo', group: 'ABC metadata', defaultImport: true },
  { key: 'aliases', label: 'Aliases', group: 'ABC metadata', defaultImport: true },
  { key: 'meta', label: 'Other ABC metadata', group: 'ABC metadata', defaultImport: true },
  { key: 'abccomments', label: 'ABC comments', group: 'ABC metadata', defaultImport: false },
  { key: 'voices', label: 'Music (notation)', group: 'Music', defaultImport: true },
  { key: 'timedChords', label: 'Timed chords', group: 'Music', defaultImport: false },
  { key: 'words', label: 'Lyrics (W: fields)', group: 'Lyrics', defaultImport: true },
  { key: 'wLines', label: 'Lyrics (w: fields)', group: 'Lyrics', defaultImport: true },
  { key: 'timedLyrics', label: 'Timed lyrics', group: 'Lyrics', defaultImport: false },
  { key: 'books', label: 'Books', group: 'Collection data', defaultImport: false },
  { key: 'tags', label: 'Tags', group: 'Collection data', defaultImport: false },
  { key: 'links', label: 'Links', group: 'Collection data', defaultImport: false },
  { key: 'boost', label: 'Search boost', group: 'Playback & extras', defaultImport: false },
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
  { key: 'composerId', label: 'Composer ID', group: 'Playback & extras', defaultImport: false },
  { key: 'notes', label: 'Legacy notes', group: 'Music', defaultImport: false },
];

const FIELD_DEF_BY_KEY = {};
TUNE_IMPORT_FIELD_DEFS.forEach(function(def) {
  FIELD_DEF_BY_KEY[def.key] = def;
});

const RESERVED_KEYS = { id: true, lastUpdated: true, lastHash: true };

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

export function formatTuneFieldValue(fieldKey, value) {
  if (isEmptyValue(value)) return '—';
  if (fieldKey === 'voices') {
    const voiceCount = Object.keys(value).length;
    const lineCount = countVoiceLines(value);
    return voiceCount + ' voice' + (voiceCount === 1 ? '' : 's') + ', ' + lineCount + ' line' + (lineCount === 1 ? '' : 's');
  }
  if (fieldKey === 'links' || fieldKey === 'files' || fieldKey === 'recordings') {
    return (Array.isArray(value) ? value.length : 0) + ' item' + (value.length === 1 ? '' : 's');
  }
  if (fieldKey === 'books' || fieldKey === 'tags' || fieldKey === 'aliases') {
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

export function buildTuneImportFieldRows(originalTune, importedTune) {
  const rows = [];
  collectImportedFieldKeys(importedTune).forEach(function(key) {
    const originalValue = originalTune ? originalTune[key] : undefined;
    const importedValue = importedTune[key];
    const def = getFieldDef(key);
    rows.push({
      key: key,
      label: def.label,
      group: def.group,
      defaultImport: def.defaultImport,
      originalValue: originalValue,
      importedValue: importedValue,
      originalDisplay: formatTuneFieldValue(key, originalValue),
      importedDisplay: formatTuneFieldValue(key, importedValue),
      differs: !tuneFieldValuesEqual(originalValue, importedValue),
    });
  });

  const groupOrder = ['ABC metadata', 'Music', 'Lyrics', 'Collection data', 'Playback & extras', 'Other'];
  rows.sort(function(a, b) {
    const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
    if (groupDiff !== 0) return groupDiff;
    return a.label.localeCompare(b.label);
  });
  return rows;
}

export function buildDefaultTuneImportSelections(rows) {
  const selections = {};
  (rows || []).forEach(function(row) {
    selections[row.key] = row.defaultImport;
  });
  return selections;
}

export function applyTuneImportSelections(originalTune, importedTune, selections) {
  const merged = cloneValue(originalTune || {});
  merged.id = originalTune && originalTune.id ? originalTune.id : merged.id;

  buildTuneImportFieldRows(originalTune, importedTune).forEach(function(row) {
    if (selections && selections[row.key] && importedTune && importedTune.hasOwnProperty(row.key)) {
      merged[row.key] = cloneValue(importedTune[row.key]);
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
