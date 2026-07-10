import {
  TUNE_IMPORT_FIELD_DEFS,
  fieldValuesSemanticallyEqual,
  getAutoAppliedImportFieldKeys,
  importedFieldIsPresent,
  linkCompareKey,
} from './tuneImportMergeUtils';

const INLINE_IMPORT_SOURCE_KINDS = ['abc', 'chordsheet', 'bulk-text'];

const FORM_SCALAR_FIELDS = [
  'title', 'artist', 'genre', 'rhythm', 'meter', 'keyName', 'tempo', 'noteLength',
  'srcUrl', 'backgroundInfo', 'lyrics', 'notes', 'boost', 'difficulty', 'tablature',
  'capo', 'playbackTempo', 'playbackPitch', 'playbackFineTune', 'transpose', 'tuning',
  'repeats', 'composerId', 'abccomments',
];

const FORM_LIST_FIELDS = ['bookList', 'tagList'];

const FORM_JSON_FIELDS = [
  'timedChords', 'timedLyrics', 'playbackAudioFilters', 'soundFonts', 'timingScaffold', 'meta',
];

const TUNE_KEY_TO_FORM = {
  name: 'title',
  composer: 'artist',
  key: 'keyName',
};

const FORM_KEY_TO_TUNE = {
  title: 'name',
  artist: 'composer',
  keyName: 'key',
};

const SKIP_SUGGESTION_KEYS = { links: true, voices: true, words: true, wLines: true };

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function parseListField(value) {
  return String(value || '')
    .split(',')
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function isFormFieldEmpty(formKey, value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function notationTextFromTune(tune) {
  const voices = tune && tune.voices ? tune.voices : null;
  if (!voices || typeof voices !== 'object') return '';
  const voiceKey = Object.keys(voices)[0];
  if (!voiceKey) return '';
  const notes = voices[voiceKey] && Array.isArray(voices[voiceKey].notes)
    ? voices[voiceKey].notes
    : [];
  return notes.join('\n');
}

export function lyricsTextFromTune(tune) {
  if (tune && Array.isArray(tune.wLines) && tune.wLines.length) {
    return tune.wLines.join('\n');
  }
  if (tune && Array.isArray(tune.words) && tune.words.length) {
    return tune.words.join('\n');
  }
  return '';
}

function tuneValueToFormValue(tuneKey, value) {
  if (tuneKey === 'books') return Array.isArray(value) ? value.join(', ') : '';
  if (tuneKey === 'tags') return Array.isArray(value) ? value.join(', ') : '';
  if (tuneKey === 'aliases') return Array.isArray(value) ? value.slice() : [];
  if (tuneKey === 'links') return Array.isArray(value) ? value.slice() : [];
  if (tuneKey === 'voices') return notationTextFromTune({ voices: value });
  if (tuneKey === 'words' || tuneKey === 'wLines') return Array.isArray(value) ? value.join('\n') : '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return cloneValue(value);
  return String(value);
}

function formValueToTuneValue(formKey, value) {
  if (formKey === 'bookList') return parseListField(value);
  if (formKey === 'tagList') return parseListField(value);
  if (formKey === 'aliases') return Array.isArray(value) ? value.slice() : [];
  if (formKey === 'links') return Array.isArray(value) ? value.slice() : [];
  if (formKey === 'notes') return value;
  if (formKey === 'lyrics') return value;
  if (FORM_JSON_FIELDS.indexOf(formKey) >= 0) return cloneValue(value);
  if (value === '' || value === null || value === undefined) return undefined;
  if (formKey === 'capo' || formKey === 'boost' || formKey === 'difficulty' || formKey === 'tempo'
    || formKey === 'playbackTempo' || formKey === 'playbackPitch' || formKey === 'playbackFineTune'
    || formKey === 'transpose' || formKey === 'repeats') {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }
  if (formKey === 'timingScaffold') {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return typeof value === 'string' ? value.trim() : value;
}

export function emptyFormValues() {
  const values = {
    title: '',
    artist: '',
    aliases: [],
    genre: '',
    rhythm: '',
    meter: '',
    keyName: '',
    tempo: '',
    noteLength: '',
    bookList: '',
    tagList: '',
    links: [],
    srcUrl: '',
    backgroundInfo: '',
    lyrics: '',
    notes: '',
    boost: '',
    difficulty: '',
    tablature: '',
    capo: '',
    playbackTempo: '',
    playbackPitch: '',
    playbackFineTune: '',
    transpose: '',
    tuning: '',
    repeats: '',
    composerId: '',
    abccomments: '',
    timedChords: null,
    timedLyrics: null,
    playbackAudioFilters: null,
    soundFonts: null,
    timingScaffold: '',
    meta: null,
  };
  return values;
}

export function tuneToFormValues(tune) {
  const source = tune || {};
  const values = emptyFormValues();
  values.title = source.name || '';
  values.artist = source.composer || '';
  values.aliases = Array.isArray(source.aliases) ? source.aliases.slice() : [];
  values.genre = source.genre || '';
  values.rhythm = source.rhythm || '';
  values.meter = source.meter || '';
  values.keyName = source.key || '';
  values.tempo = source.tempo != null && source.tempo !== '' ? String(source.tempo) : '';
  values.noteLength = source.noteLength || '';
  values.bookList = Array.isArray(source.books) ? source.books.join(', ') : '';
  values.tagList = Array.isArray(source.tags) ? source.tags.join(', ') : '';
  values.links = Array.isArray(source.links) ? source.links.slice() : [];
  values.srcUrl = source.srcUrl || '';
  values.backgroundInfo = source.backgroundInfo || '';
  values.lyrics = lyricsTextFromTune(source);
  values.notes = notationTextFromTune(source);
  values.boost = source.boost != null && source.boost !== '' ? String(source.boost) : '';
  values.difficulty = source.difficulty != null && source.difficulty !== '' ? String(source.difficulty) : '';
  values.tablature = source.tablature || '';
  values.capo = source.capo != null && source.capo !== '' ? String(source.capo) : '';
  values.playbackTempo = source.playbackTempo != null && source.playbackTempo !== '' ? String(source.playbackTempo) : '';
  values.playbackPitch = source.playbackPitch != null && source.playbackPitch !== '' ? String(source.playbackPitch) : '';
  values.playbackFineTune = source.playbackFineTune != null && source.playbackFineTune !== '' ? String(source.playbackFineTune) : '';
  values.transpose = source.transpose != null && source.transpose !== '' ? String(source.transpose) : '';
  values.tuning = source.tuning || '';
  values.repeats = source.repeats != null && source.repeats !== '' ? String(source.repeats) : '';
  values.composerId = source.composerId || '';
  values.abccomments = source.abccomments || '';
  values.timedChords = source.timedChords ? cloneValue(source.timedChords) : null;
  values.timedLyrics = source.timedLyrics ? cloneValue(source.timedLyrics) : null;
  values.playbackAudioFilters = source.playbackAudioFilters ? cloneValue(source.playbackAudioFilters) : null;
  values.soundFonts = source.soundFonts ? cloneValue(source.soundFonts) : null;
  values.timingScaffold = source.timingScaffold === true || source.timingScaffold === false
    ? String(source.timingScaffold)
    : '';
  values.meta = source.meta ? cloneValue(source.meta) : null;
  return values;
}

export function formValuesToTune(formValues, baseTune) {
  const next = Object.assign({}, baseTune || {});
  const values = formValues || emptyFormValues();
  next.name = String(values.title || '').trim();
  next.composer = String(values.artist || '').trim();
  next.aliases = Array.isArray(values.aliases) ? values.aliases.slice() : [];
  next.genre = String(values.genre || '').trim();
  next.rhythm = String(values.rhythm || '').trim();
  next.meter = String(values.meter || '').trim();
  next.key = String(values.keyName || '').trim();
  next.books = parseListField(values.bookList);
  next.tags = parseListField(values.tagList);
  next.links = Array.isArray(values.links) ? values.links.slice() : [];
  next.srcUrl = String(values.srcUrl || '').trim();
  next.backgroundInfo = values.backgroundInfo || '';

  const scalarTuneFields = {
    tempo: 'tempo',
    noteLength: 'noteLength',
    boost: 'boost',
    difficulty: 'difficulty',
    tablature: 'tablature',
    capo: 'capo',
    playbackTempo: 'playbackTempo',
    playbackPitch: 'playbackPitch',
    playbackFineTune: 'playbackFineTune',
    transpose: 'transpose',
    tuning: 'tuning',
    repeats: 'repeats',
    composerId: 'composerId',
    abccomments: 'abccomments',
  };
  Object.keys(scalarTuneFields).forEach(function(formKey) {
    const tuneKey = scalarTuneFields[formKey];
    const converted = formValueToTuneValue(formKey, values[formKey]);
    if (converted === undefined || converted === '') {
      delete next[tuneKey];
    } else {
      next[tuneKey] = converted;
    }
  });

  FORM_JSON_FIELDS.forEach(function(formKey) {
    const converted = formValueToTuneValue(formKey, values[formKey]);
    if (converted === undefined || converted === null) {
      delete next[formKey];
    } else {
      next[formKey] = converted;
    }
  });

  const firstVoice = next.voices && Object.keys(next.voices).length
    ? Object.keys(next.voices)[0]
    : '1';
  if (!next.voices) next.voices = {};
  const noteText = String(values.notes || '').trim();
  next.voices[firstVoice] = Object.assign({}, next.voices[firstVoice] || { meta: '' }, {
    notes: noteText ? noteText.split('\n') : [],
  });

  const lyricText = String(values.lyrics || '').trim();
  if (lyricText) {
    next.wLines = lyricText.split('\n');
    delete next.words;
  } else {
    delete next.wLines;
    next.words = [];
  }

  return next;
}

export function mergeImportedLinks(existingLinks, importedLinks) {
  const result = Array.isArray(existingLinks) ? existingLinks.slice() : [];
  const seen = {};
  result.forEach(function(link) {
    const key = linkCompareKey(link);
    if (key) seen[key] = true;
  });
  (Array.isArray(importedLinks) ? importedLinks : []).forEach(function(link) {
    const key = linkCompareKey(link);
    if (!key || seen[key]) return;
    seen[key] = true;
    result.push(cloneValue(link));
  });
  return result;
}

function formKeyForTuneKey(tuneKey) {
  if (TUNE_KEY_TO_FORM[tuneKey]) return TUNE_KEY_TO_FORM[tuneKey];
  if (tuneKey === 'books') return 'bookList';
  if (tuneKey === 'tags') return 'tagList';
  if (tuneKey === 'voices') return 'notes';
  if (tuneKey === 'words' || tuneKey === 'wLines') return 'lyrics';
  if (FORM_SCALAR_FIELDS.indexOf(tuneKey) >= 0 || FORM_JSON_FIELDS.indexOf(tuneKey) >= 0) return tuneKey;
  return null;
}

function getTuneFieldValue(tune, tuneKey) {
  if (!tune) return undefined;
  if (tuneKey === 'voices') return tune.voices;
  return tune[tuneKey];
}

function getFormFieldValue(formValues, formKey) {
  if (!formValues) return undefined;
  return formValues[formKey];
}

function setFormFieldValue(formValues, formKey, value) {
  const next = Object.assign({}, formValues);
  next[formKey] = cloneValue(value);
  return next;
}

export function canApplyImportInline(sourceKind) {
  return INLINE_IMPORT_SOURCE_KINDS.indexOf(sourceKind) >= 0;
}

export function buildReviewFormState(baseTune, importedTune, mode) {
  const imported = importedTune || {};
  let formValues;
  const suggestions = {};
  const autoAppliedKeys = [];

  if (mode === 'create') {
    formValues = tuneToFormValues(imported);
    return { formValues: formValues, suggestions: suggestions, autoAppliedKeys: autoAppliedKeys };
  }

  formValues = tuneToFormValues(baseTune || {});

  TUNE_IMPORT_FIELD_DEFS.forEach(function(def) {
    const tuneKey = def.key;
    if (SKIP_SUGGESTION_KEYS[tuneKey]) {
      if (tuneKey === 'links' && importedFieldIsPresent('links', imported.links)) {
        formValues.links = mergeImportedLinks(formValues.links, imported.links);
        autoAppliedKeys.push('links');
      }
      return;
    }

    const importedValue = getTuneFieldValue(imported, tuneKey);
    if (!importedFieldIsPresent(tuneKey, importedValue)) return;

    const formKey = formKeyForTuneKey(tuneKey);
    if (!formKey) return;

    const baseValue = getTuneFieldValue(baseTune, tuneKey);
    const autoKeys = getAutoAppliedImportFieldKeys(baseTune, imported);
    if (autoKeys.indexOf(tuneKey) >= 0) {
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      return;
    }

    if (fieldValuesSemanticallyEqual(tuneKey, baseValue, importedValue)) return;

    const currentFormValue = getFormFieldValue(formValues, formKey);
    if (isFormFieldEmpty(formKey, currentFormValue)) {
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      return;
    }

    suggestions[formKey] = {
      key: tuneKey,
      formKey: formKey,
      value: cloneValue(importedValue),
      displayValue: tuneValueToFormValue(tuneKey, importedValue),
    };
  });

  return { formValues: formValues, suggestions: suggestions, autoAppliedKeys: autoAppliedKeys };
}

export function applyImportSuggestion(formValues, formKey, suggestion) {
  const next = Object.assign({}, formValues || emptyFormValues());
  if (!suggestion) return next;
  const displayValue = suggestion.displayValue != null
    ? suggestion.displayValue
    : tuneValueToFormValue(suggestion.key, suggestion.value);
  next[formKey] = cloneValue(displayValue);
  return next;
}

export function applyInlineImportToForm(currentFormValues, importedTune) {
  const asTune = formValuesToTune(currentFormValues, {});
  return buildReviewFormState(asTune, importedTune, 'import');
}

export function importedNotationText(importedTune) {
  return notationTextFromTune(importedTune || {});
}

export function importedLyricsText(importedTune) {
  return lyricsTextFromTune(importedTune || {});
}
