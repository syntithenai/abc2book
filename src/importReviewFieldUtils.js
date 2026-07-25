import {
  TUNE_IMPORT_FIELD_DEFS,
  fieldValuesSemanticallyEqual,
  getAutoAppliedImportFieldKeys,
  importedFieldIsPresent,
  linkCompareKey,
} from './tuneImportMergeUtils';
import { noteLinesHaveRealMelody } from './timedImportFinalizer';
import { hasLyricEmbeddedChords } from './chordSheetUtils';
import { setPlainLyricLines } from './wLinesUtils';
import { stripBraceTempoDirectiveLines } from './chordProMetaUtils';
import { allGenres, mergeBibliographicList } from './tuneBibliographicUtils';
import {
  inferKeyFromChordGrid,
  keysAreCompatible,
} from './chordKeyMergeOptions';
import { mergeImportDraftTune } from './importReviewCandidateUtils';

const INLINE_IMPORT_SOURCE_KINDS = ['abc', 'chordsheet', 'bulk-text'];

const FORM_SCALAR_FIELDS = [
  'title', 'artist', 'rhythm', 'meter', 'keyName', 'tempo', 'noteLength',
  'srcUrl', 'backgroundInfo', 'lyrics', 'notes', 'boost', 'difficulty', 'tablature',
  'capo', 'playbackTempo', 'playbackPitch', 'playbackFineTune', 'transpose', 'tuning',
  'repeats', 'composerId', 'abccomments',
];

const FORM_LIST_FIELDS = ['bookList', 'tagList'];

const FORM_JSON_FIELDS = [
  'playbackAudioFilters', 'soundFonts', 'timingScaffold', 'meta',
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

/** Even in suggestOnly, fill these when the local tune has no value. */
const AUTO_FILL_EMPTY_TUNE_KEYS = {
  composer: true,
  artists: true,
  aliases: true,
  genres: true,
  meter: true,
  key: true,
  tempo: true,
  noteLength: true,
  capo: true,
  voices: true,
};

/**
 * Case-insensitive union of string lists; keeps first-seen casing/order.
 */
export function unionStringLists() {
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

function voiceNoteLines(tune) {
  const text = notationTextFromTune(tune || {});
  return text ? text.split(/\r?\n/) : [];
}

/** Prefer keeping existing voices when they contain real melody notes. */
export function shouldPreferExistingNotation(baseTune, importedTune) {
  const baseHasReal = noteLinesHaveRealMelody(voiceNoteLines(baseTune));
  if (!baseHasReal) return false;
  const importedIsScaffold = !!(importedTune && importedTune.timingScaffold)
    || !noteLinesHaveRealMelody(voiceNoteLines(importedTune));
  return importedIsScaffold;
}

/**
 * True when the preexisting collection tune already has ABC melody notes or
 * quoted chord symbols. Ignores empty / rest-only scaffolds. Used so inferred
 * keys auto-apply only when there is no real preexisting notation (not when
 * notation was merely auto-merged from the import).
 */
export function tuneHasPreexistingAbcNotesOrChords(tune) {
  if (!tune) return false;
  const lines = voiceNoteLines(tune);
  if (noteLinesHaveRealMelody(lines)) return true;
  const text = lines.join('\n');
  // Quoted ABC chord symbols, e.g. "Am" or "F#m7"
  return /"[A-Ga-g][^"]*"/.test(text);
}

/** First few non-empty lyric lines for merge comparison UI. */
export function lyricPreviewLines(tune, limit) {
  const max = limit > 0 ? limit : 3;
  const text = lyricsTextFromTune(tune || {});
  const lines = [];
  String(text || '').split(/\r?\n/).forEach(function(line) {
    if (lines.length >= max) return;
    const trimmed = String(line || '').trim();
    if (trimmed) lines.push(trimmed);
  });
  return lines;
}

function normalizeLyricCompareLine(line) {
  return String(line || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lyricLineSimilarity(a, b) {
  const na = normalizeLyricCompareLine(a);
  const nb = normalizeLyricCompareLine(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 8 && nb.indexOf(na) !== -1) return 0.9;
  if (nb.length >= 8 && na.indexOf(nb) !== -1) return 0.9;
  const ta = na.split(' ').filter(function(t) { return t.length > 2; });
  const tb = nb.split(' ').filter(function(t) { return t.length > 2; });
  if (!ta.length || !tb.length) return 0;
  let inter = 0;
  const setB = {};
  tb.forEach(function(t) { setB[t] = true; });
  ta.forEach(function(t) { if (setB[t]) inter += 1; });
  return inter / Math.max(ta.length, tb.length);
}

/**
 * Find best fuzzy alignment between original and import lyric lines, then return
 * paired previews so intro chord fluff does not hide matching verse lines.
 */
export function alignedLyricPreviewPairs(originalTune, importedTune, limit) {
  const max = limit > 0 ? limit : 3;
  const originalAll = String(lyricsTextFromTune(originalTune || {}) || '')
    .split(/\r?\n/)
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean);
  const importedAll = String(lyricsTextFromTune(importedTune || {}) || '')
    .split(/\r?\n/)
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean);

  if (!originalAll.length && !importedAll.length) {
    return { original: [], imported: [] };
  }
  if (!originalAll.length) {
    return { original: [], imported: importedAll.slice(0, max) };
  }
  if (!importedAll.length) {
    return { original: originalAll.slice(0, max), imported: [] };
  }

  let bestScore = -1;
  let bestOi = 0;
  let bestIi = 0;
  const scan = Math.min(originalAll.length, 40);
  const scanI = Math.min(importedAll.length, 40);
  for (let oi = 0; oi < scan; oi += 1) {
    for (let ii = 0; ii < scanI; ii += 1) {
      const score = lyricLineSimilarity(originalAll[oi], importedAll[ii]);
      if (score > bestScore) {
        bestScore = score;
        bestOi = oi;
        bestIi = ii;
      }
    }
  }
  if (bestScore < 0.35) {
    return {
      original: originalAll.slice(0, max),
      imported: importedAll.slice(0, max),
    };
  }
  return {
    original: originalAll.slice(bestOi, bestOi + max),
    imported: importedAll.slice(bestIi, bestIi + max),
  };
}

/**
 * Summarize merge field activity for the review banner.
 * autoMerged = auto-applied keys still matching import (or accepted import).
 * pending = suggestions still differing from the form.
 */
export function summarizeImportMergeFieldCounts(autoAppliedKeys, suggestions, formValues, acceptedImportCount) {
  const pendingKeys = Object.keys(suggestions || {}).filter(function(key) {
    return importSuggestionDiffersFromForm(key, suggestions[key], formValues);
  });
  const pendingSet = {};
  pendingKeys.forEach(function(k) { pendingSet[k] = true; });
  const formKeySeen = {};
  let autoStillApplied = 0;
  (Array.isArray(autoAppliedKeys) ? autoAppliedKeys : []).forEach(function(tuneKey) {
    const formKey = TUNE_KEY_TO_FORM[tuneKey] || tuneKey;
    if (formKeySeen[formKey]) return;
    formKeySeen[formKey] = true;
    if (!pendingSet[formKey]) autoStillApplied += 1;
  });
  const accepted = Math.max(0, parseInt(acceptedImportCount, 10) || 0);
  return {
    autoMerged: autoStillApplied + accepted,
    pending: pendingKeys.length,
    pendingKeys: pendingKeys,
  };
}

/** First non-empty ABC voice note line for merge comparison UI. */
export function notationPreviewLine(tune) {
  let text = notationTextFromTune(tune || {});
  if (!String(text || '').trim() && tune && tune.notes != null) {
    text = String(tune.notes);
  }
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

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
  if (formKey === 'notes' || formKey === 'voices') {
    if (typeof value === 'object') return voiceNotesLineCount(value) === 0;
  }
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function voiceNotesLineCount(voices) {
  if (!voices || typeof voices !== 'object') return 0;
  return Object.keys(voices).reduce(function(total, voiceKey) {
    const voice = voices[voiceKey];
    const notes = voice && Array.isArray(voice.notes) ? voice.notes : [];
    return total + notes.filter(function(line) { return String(line || '').trim(); }).length;
  }, 0);
}

function baselineDisplayForFormValue(formKey, value) {
  if (formKey === 'notes' || formKey === 'voices') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return notationTextFromTune({ voices: value });
    }
    return String(value || '');
  }
  if (formKey === 'lyrics') return String(value || '');
  if (formKey === 'bookList' || formKey === 'tagList') {
    return parseListField(value).join(', ');
  }
  if (Array.isArray(value)) {
    return value.map(function(item) {
      if (item && typeof item === 'object') return String(item.title || item.link || '').trim();
      return String(item || '').trim();
    }).filter(Boolean).join('; ');
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '';
    }
  }
  return value == null ? '' : String(value);
}

/**
 * Ensure every import Use-dropdown includes a "Current value" choice that
 * restores the pre-import field value. Current is first by default; pass
 * options.preferImported to put the imported choice first (ChordPro lyrics).
 */
export function attachCurrentValueChoice(suggestion, baselineValue, baselineDisplay, options) {
  if (!suggestion) return suggestion;
  const opts = options || {};
  const formKey = suggestion.formKey || '';
  const tuneKey = suggestion.key || FORM_KEY_TO_TUNE[formKey] || formKey;
  const display = baselineDisplay != null
    ? baselineDisplay
    : baselineDisplayForFormValue(formKey, baselineValue);
  const currentChoice = {
    id: 'current',
    label: 'Current value',
    preview: String(display || '').trim() ? String(display) : '(empty)',
    value: baselineValue === undefined ? null : cloneValue(baselineValue),
    source: 'current',
  };
  let rest;
  if (Array.isArray(suggestion.choices) && suggestion.choices.length) {
    rest = suggestion.choices.filter(function(choice) {
      return !(choice && choice.id === 'current');
    });
  } else {
    rest = [{
      id: 'imported',
      label: 'Imported',
      preview: suggestion.displayValue != null && String(suggestion.displayValue).trim() !== ''
        ? String(suggestion.displayValue)
        : '(empty)',
      value: cloneValue(suggestion.value),
      source: 'import',
    }];
  }
  const baselineComparable = formValueAsTuneComparable(formKey, baselineValue);
  const unique = [];
  rest.forEach(function(choice) {
    if (!choice) return;
    const choiceComparable = formValueAsTuneComparable(formKey, choice.value);
    if (fieldValuesSemanticallyEqual(tuneKey, baselineComparable, choiceComparable)) {
      return;
    }
    const dup = unique.some(function(item) {
      return fieldValuesSemanticallyEqual(
        tuneKey,
        formValueAsTuneComparable(formKey, item.value),
        choiceComparable
      );
    });
    if (dup) return;
    unique.push(choice);
  });
  const choices = opts.preferImported
    ? unique.concat([currentChoice])
    : [currentChoice].concat(unique);
  return Object.assign({}, suggestion, {
    baselineValue: baselineValue === undefined ? null : cloneValue(baselineValue),
    choices: choices,
  });
}

/**
 * Fold coalesced alternate field values into review suggestions without dropping any.
 */
export function applyCoalescedFieldChoicesToSuggestions(suggestions, fieldChoices, formValues) {
  const next = Object.assign({}, suggestions || {});
  const choicesByFormKey = fieldChoices && typeof fieldChoices === 'object' ? fieldChoices : {};
  Object.keys(choicesByFormKey).forEach(function(formKey) {
    const extras = Array.isArray(choicesByFormKey[formKey]) ? choicesByFormKey[formKey] : [];
    if (!extras.length) return;
    const existing = next[formKey];
    const baseline = formValues ? getFormFieldValue(formValues, formKey) : null;
    let mergedChoices = [];
    if (existing && Array.isArray(existing.choices)) {
      mergedChoices = existing.choices.filter(function(choice) {
        return !(choice && choice.id === 'current');
      });
    } else if (existing) {
      mergedChoices = [{
        id: 'imported',
        label: 'Imported',
        preview: existing.displayValue != null ? String(existing.displayValue) : '',
        value: cloneValue(existing.value),
        source: existing.source || 'import',
      }];
    }
    extras.forEach(function(choice, index) {
      if (!choice) return;
      const tuneKey = (existing && existing.key)
        || FORM_KEY_TO_TUNE[formKey]
        || (formKey === 'notes' ? 'voices' : formKey);
      const choiceComparable = formValueAsTuneComparable(formKey, choice.value);
      const duplicate = mergedChoices.some(function(item) {
        return fieldValuesSemanticallyEqual(
          tuneKey,
          formValueAsTuneComparable(formKey, item && item.value),
          choiceComparable
        );
      });
      if (duplicate) return;
      if (fieldValuesSemanticallyEqual(tuneKey, formValueAsTuneComparable(formKey, baseline), choiceComparable)) {
        return;
      }
      mergedChoices.push(Object.assign({}, choice, {
        id: choice.id || (formKey + '-coalesce-' + index),
      }));
    });
    if (!mergedChoices.length) return;
    const primary = existing || {
      key: formKey === 'title' ? 'name' : (formKey === 'artist' ? 'composer' : (formKey === 'notes' ? 'voices' : (formKey === 'lyrics' ? 'words' : formKey))),
      formKey: formKey,
      value: cloneValue(mergedChoices[0].value),
      displayValue: mergedChoices[0].preview,
    };
    next[formKey] = attachCurrentValueChoice(Object.assign({}, primary, {
      value: primary.value !== undefined ? primary.value : cloneValue(mergedChoices[0].value),
      displayValue: primary.displayValue != null ? primary.displayValue : mergedChoices[0].preview,
      choices: mergedChoices,
    }), baseline, baselineDisplayForFormValue(formKey, baseline));
  });
  return next;
}

export function notationTextFromTune(tune) {
  const voices = tune && tune.voices ? tune.voices : null;
  if (!voices || typeof voices !== 'object') return '';
  const keys = Object.keys(voices);
  if (!keys.length) return '';
  let voiceKey = keys[0];
  for (let i = 0; i < keys.length; i += 1) {
    const notes = voices[keys[i]] && Array.isArray(voices[keys[i]].notes)
      ? voices[keys[i]].notes
      : [];
    if (notes.some(function(line) { return String(line || '').trim(); })) {
      voiceKey = keys[i];
      break;
    }
  }
  const notes = voices[voiceKey] && Array.isArray(voices[voiceKey].notes)
    ? voices[voiceKey].notes
    : [];
  return notes.join('\n');
}

export function lyricsTextFromTune(tune) {
  // Prefer ChordPro / plain block lyrics in `words` over note-aligned `wLines`.
  let text = '';
  if (tune && Array.isArray(tune.words) && tune.words.length) {
    text = tune.words.join('\n');
  } else if (tune && Array.isArray(tune.wLines) && tune.wLines.length) {
    text = tune.wLines.join('\n');
  }
  return stripBraceTempoDirectiveLines(text);
}

function lyricLinesFromTune(tune) {
  const text = lyricsTextFromTune(tune);
  if (!text) return [];
  return text.split(/\r?\n/);
}

function importedLyricsAreChordPro(importedTune) {
  const lines = Array.isArray(importedTune && importedTune.words) && importedTune.words.length
    ? importedTune.words
    : lyricLinesFromTune(importedTune);
  return hasLyricEmbeddedChords(lines);
}

function tuneValueToFormValue(tuneKey, value) {
  if (tuneKey === 'books') return Array.isArray(value) ? value.join(', ') : '';
  if (tuneKey === 'tags') return Array.isArray(value) ? value.join(', ') : '';
  if (tuneKey === 'aliases' || tuneKey === 'artists' || tuneKey === 'genres') return Array.isArray(value) ? value.slice() : [];
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
  if (formKey === 'aliases' || formKey === 'artists' || formKey === 'genres') return Array.isArray(value) ? value.slice() : [];
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
    artists: [],
    aliases: [],
    genres: [],
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
    voices: { '1': { meta: '', notes: [] } },
    suitableForPractice: false,
    suitableFor: [],
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
    playbackAudioFilters: null,
    soundFonts: null,
    timingScaffold: '',
    meta: null,
    tuneFiles: [],
    activeFile: '',
  };
  return values;
}

export function tuneToFormValues(tune) {
  const source = tune || {};
  const values = emptyFormValues();
  values.title = source.name || '';
  values.artist = source.composer || '';
  values.artists = Array.isArray(source.artists) ? source.artists.slice() : [];
  values.aliases = Array.isArray(source.aliases) ? source.aliases.slice() : [];
  values.genres = allGenres(source);
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
  values.voices = source.voices && typeof source.voices === 'object'
    ? cloneValue(source.voices)
    : { '1': { meta: '', notes: values.notes ? values.notes.split('\n') : [] } };
  if (!values.voices || !Object.keys(values.voices).length) {
    values.voices = { '1': { meta: '', notes: values.notes ? values.notes.split('\n') : [] } };
  }
  values.suitableForPractice = !!source.suitableForPractice;
  values.suitableFor = Array.isArray(source.suitableFor) ? source.suitableFor.slice() : [];
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
  values.playbackAudioFilters = source.playbackAudioFilters ? cloneValue(source.playbackAudioFilters) : null;
  values.soundFonts = source.soundFonts ? cloneValue(source.soundFonts) : null;
  values.timingScaffold = source.timingScaffold === true || source.timingScaffold === false
    ? String(source.timingScaffold)
    : '';
  values.meta = source.meta ? cloneValue(source.meta) : null;
  values.tuneFiles = Array.isArray(source.tuneFiles)
    ? source.tuneFiles.map(function(f) { return Object.assign({}, f); })
    : [];
  values.activeFile = source.activeFile ? String(source.activeFile) : '';
  return values;
}

export function formValuesToTune(formValues, baseTune) {
  const next = Object.assign({}, baseTune || {});
  const values = formValues || emptyFormValues();
  next.name = String(values.title || '').trim();
  next.composer = String(values.artist || '').trim();
  next.artists = Array.isArray(values.artists) ? values.artists.slice() : [];
  next.aliases = Array.isArray(values.aliases) ? values.aliases.slice() : [];
  next.genres = Array.isArray(values.genres) ? values.genres.slice() : [];
  delete next.genre;
  next.rhythm = String(values.rhythm || '').trim();
  next.meter = String(values.meter || '').trim();
  next.key = String(values.keyName || '').trim();
  next.books = parseListField(values.bookList);
  next.tags = parseListField(values.tagList);
  next.links = Array.isArray(values.links) ? values.links.slice() : [];
  next.srcUrl = String(values.srcUrl || '').trim();
  next.backgroundInfo = values.backgroundInfo || '';
  next.tuneFiles = Array.isArray(values.tuneFiles)
    ? values.tuneFiles.map(function(f) { return Object.assign({}, f); })
    : (Array.isArray(baseTune && baseTune.tuneFiles) ? baseTune.tuneFiles.slice() : []);
  next.activeFile = values.activeFile
    ? String(values.activeFile)
    : (baseTune && baseTune.activeFile ? String(baseTune.activeFile) : '');

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
    ? Object.keys(next.voices).sort()[0]
    : '1';
  if (values.voices && typeof values.voices === 'object' && Object.keys(values.voices).length) {
    next.voices = cloneValue(values.voices);
    Object.keys(next.voices).forEach(function(key) {
      const voice = next.voices[key] || {};
      next.voices[key] = {
        meta: typeof voice.meta === 'string' ? voice.meta : '',
        notes: Array.isArray(voice.notes)
          ? voice.notes.slice()
          : String(voice.notes || '').split(/\r?\n/),
      };
    });
  } else {
    if (!next.voices) next.voices = {};
    const noteText = String(values.notes || '').trim();
    next.voices[firstVoice] = Object.assign({}, next.voices[firstVoice] || { meta: '' }, {
      notes: noteText ? noteText.split('\n') : [],
    });
  }

  next.suitableForPractice = !!values.suitableForPractice;
  if (Array.isArray(values.suitableFor) && values.suitableFor.length) {
    next.suitableFor = values.suitableFor.slice();
  } else {
    delete next.suitableFor;
  }

  const lyricText = String(values.lyrics || '').trim();
  if (lyricText) {
    const lyricLines = lyricText.split(/\r?\n/);
    setPlainLyricLines(next, lyricLines);
    if (hasLyricEmbeddedChords(lyricLines)) {
      delete next.wLines;
    }
  } else {
    delete next.wLines;
    next.words = [];
  }

  delete next.timedLyrics;
  delete next.timedChords;
  delete next.timedMelody;

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
  if (tuneKey === 'artists' || tuneKey === 'aliases' || tuneKey === 'links' || tuneKey === 'genres') return tuneKey;
  if (FORM_SCALAR_FIELDS.indexOf(tuneKey) >= 0 || FORM_JSON_FIELDS.indexOf(tuneKey) >= 0) return tuneKey;
  return null;
}

function getTuneFieldValue(tune, tuneKey) {
  if (!tune) return undefined;
  if (tuneKey === 'genres') return allGenres(tune);
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

/**
 * Detect when the import session tune has content the live form still lacks.
 * Used to re-init the Add form after inline ChordPro/ABC imports that race
 * with form→session sync (suppressFormInitRef).
 */
export function sessionTuneAheadOfForm(candidate, formValues) {
  if (!candidate || !candidate.tune) return false;
  const tune = candidate.tune;
  const form = formValues || emptyFormValues();
  const tuneTitle = String(tune.name || '').trim();
  const formTitle = String(form.title || '').trim();
  if (tuneTitle && tuneTitle !== formTitle) return true;
  const tuneComposer = String(tune.composer || '').trim();
  const formComposer = String(form.artist || '').trim();
  if (tuneComposer && tuneComposer !== formComposer) return true;
  const tuneLyrics = lyricsTextFromTune(tune).trim();
  const formLyrics = String(form.lyrics || '').trim();
  if (tuneLyrics && tuneLyrics !== formLyrics) return true;
  const tuneNotes = notationTextFromTune(tune).trim();
  const formNotes = String(form.notes || '').trim();
  if (tuneNotes && tuneNotes !== formNotes) return true;
  const pending = candidate.pendingInlineSuggestions;
  if (pending && typeof pending === 'object' && Object.keys(pending).length > 0) {
    return true;
  }
  const inlineForm = candidate.inlineFormValues;
  if (inlineForm && typeof inlineForm === 'object') {
    const inlineTitle = String(inlineForm.title || '').trim();
    if (inlineTitle && inlineTitle !== formTitle) return true;
    const inlineComposer = String(inlineForm.artist || '').trim();
    if (inlineComposer && inlineComposer !== formComposer) return true;
    const inlineLyrics = String(inlineForm.lyrics || '').trim();
    if (inlineLyrics && inlineLyrics !== formLyrics) return true;
  }
  return false;
}

/** Stable signal for re-running form init when an import updates the session tune. */
export function buildTuneFormSyncSignal(candidate) {
  if (!candidate || !candidate.tune) return '';
  const tune = candidate.tune;
  const parts = [
    String(tune.name || ''),
    String(tune.composer || ''),
    lyricsTextFromTune(tune),
    notationTextFromTune(tune),
    candidate.sourceKind || '',
    String(candidate.inlineImportRevision != null ? candidate.inlineImportRevision : ''),
  ];
  const inlineForm = candidate.inlineFormValues;
  if (inlineForm && typeof inlineForm === 'object') {
    parts.push(String(inlineForm.title || ''));
    parts.push(String(inlineForm.artist || ''));
    parts.push(String(inlineForm.lyrics || ''));
  }
  const pending = candidate.pendingInlineSuggestions;
  if (pending && typeof pending === 'object') {
    parts.push(Object.keys(pending).sort().join(','));
  }
  return parts.join('\x1e');
}

/**
 * When the preexisting base has no ABC notes/chords, prefer the key inferred
 * from imported lyric/chord-chart spellings over a mismatched declared key.
 */
function autoApplyInferredKeyFromChords(formValues, suggestions, autoAppliedKeys, baseTune, imported) {
  if (tuneHasPreexistingAbcNotesOrChords(baseTune)) {
    return { formValues: formValues, suggestions: suggestions, autoAppliedKeys: autoAppliedKeys };
  }
  const chordSource = lyricsTextFromTune(imported || {});
  if (!String(chordSource || '').trim()) {
    return { formValues: formValues, suggestions: suggestions, autoAppliedKeys: autoAppliedKeys };
  }
  // Prefer ChordPro / lyric-embedded chords; also try plain chord-grid lines.
  const inferred = inferKeyFromChordGrid(chordSource);
  if (!inferred) {
    return { formValues: formValues, suggestions: suggestions, autoAppliedKeys: autoAppliedKeys };
  }

  const currentKey = String((formValues && formValues.keyName) || '').trim();
  if (currentKey && keysAreCompatible(currentKey, inferred)) {
    return { formValues: formValues, suggestions: suggestions, autoAppliedKeys: autoAppliedKeys };
  }

  const baselineForRevert = currentKey
    || String((baseTune && baseTune.key) || '').trim();

  let nextForm = setFormFieldValue(formValues, 'keyName', inferred);
  const nextAuto = Array.isArray(autoAppliedKeys) ? autoAppliedKeys.slice() : [];
  if (nextAuto.indexOf('key') < 0) nextAuto.push('key');

  const nextSuggestions = Object.assign({}, suggestions || {});
  if (baselineForRevert && !keysAreCompatible(baselineForRevert, inferred)) {
    nextSuggestions.keyName = attachCurrentValueChoice({
      key: 'key',
      formKey: 'keyName',
      value: inferred,
      displayValue: inferred,
    }, baselineForRevert, baselineForRevert, { preferImported: true });
  } else {
    delete nextSuggestions.keyName;
  }

  return {
    formValues: nextForm,
    suggestions: nextSuggestions,
    autoAppliedKeys: nextAuto,
  };
}

export function buildReviewFormState(baseTune, importedTune, mode, options) {
  const opts = options || {};
  const suggestOnly = opts.mergeMode === 'suggestOnly' || mode === 'suggestOnly';
  const imported = importedTune || {};
  let formValues;
  let suggestions = {};
  let autoAppliedKeys = [];

  if (mode === 'create') {
    formValues = tuneToFormValues(imported);
    return autoApplyInferredKeyFromChords(
      formValues,
      suggestions,
      autoAppliedKeys,
      null,
      imported
    );
  }

  formValues = tuneToFormValues(baseTune || {});

  // Default books/tags to the union of original + import (deduped).
  const unionBooks = unionStringLists(
    baseTune && baseTune.books,
    imported.books
  );
  const unionTags = unionStringLists(
    baseTune && baseTune.tags,
    imported.tags
  );
  formValues.bookList = unionBooks.join(', ');
  formValues.tagList = unionTags.join(', ');

  TUNE_IMPORT_FIELD_DEFS.forEach(function(def) {
    const tuneKey = def.key;
    if (tuneKey === 'books' || tuneKey === 'tags') {
      // Already applied as union above; do not offer replace suggestions.
      return;
    }
    if (SKIP_SUGGESTION_KEYS[tuneKey]) {
      if (tuneKey === 'links' && importedFieldIsPresent('links', imported.links)) {
        const importedLinks = Array.isArray(imported.links) ? imported.links : [];
        const baseHasLinks = Array.isArray(baseTune && baseTune.links)
          && baseTune.links.some(function(link) {
            return !!(link && link.link && String(link.link).trim());
          });
        const baselineLinks = Array.isArray(formValues.links) ? cloneValue(formValues.links) : [];
        if (suggestOnly || importedLinks.length > 1 || baseHasLinks) {
          suggestions.links = attachCurrentValueChoice({
            key: 'links',
            formKey: 'links',
            value: cloneValue(importedLinks),
            displayValue: importedLinks.map(function(link) {
              return String((link && (link.title || link.link)) || '').trim();
            }).filter(Boolean).join('; '),
            choices: importedLinks.map(function(link, index) {
              return {
                id: 'link-' + index,
                label: String((link && (link.title || link.link)) || ('Link ' + (index + 1))).trim(),
                preview: String((link && link.link) || '').trim(),
                value: [cloneValue(link)],
                source: 'youtube',
              };
            }),
          }, baselineLinks, baselineDisplayForFormValue('links', baselineLinks));
        } else {
          formValues.links = mergeImportedLinks(formValues.links, imported.links);
          autoAppliedKeys.push('links');
        }
      }
      if (tuneKey === 'voices' && importedFieldIsPresent('voices', imported.voices)) {
        if (shouldPreferExistingNotation(baseTune, imported)) {
          // Keep existing real notation; ignore chord-scaffold import for merge default.
          return;
        }
        const importedVoices = imported.voices;
        const importedNotes = notationTextFromTune({ voices: importedVoices });
        const baselineVoices = cloneValue(formValues.voices || { '1': { meta: '', notes: [] } });
        const baselineNotes = String(formValues.notes || '').trim()
          || notationTextFromTune({ voices: baselineVoices });
        const localEmpty = isFormFieldEmpty('notes', formValues.notes)
          && isFormFieldEmpty('voices', formValues.voices);
        if (localEmpty && AUTO_FILL_EMPTY_TUNE_KEYS.voices) {
          formValues.voices = cloneValue(importedVoices);
          formValues.notes = importedNotes;
          autoAppliedKeys.push('voices');
          return;
        }
        if (!fieldValuesSemanticallyEqual('voices', getTuneFieldValue(baseTune, 'voices'), importedVoices)) {
          suggestions.notes = attachCurrentValueChoice({
            key: 'voices',
            formKey: 'notes',
            value: cloneValue(importedVoices),
            displayValue: importedNotes,
          }, baselineVoices, baselineNotes);
        }
      }
      if ((tuneKey === 'words' || tuneKey === 'wLines') && !suggestions.lyrics) {
        const lyrics = lyricsTextFromTune(imported);
        if (lyrics.trim()) {
          const baselineLyrics = formValues.lyrics || '';
          const preferChordPro = importedLyricsAreChordPro(imported);
          const lyricValue = Array.isArray(imported.words) && imported.words.length
            ? cloneValue(imported.words)
            : lyrics.split(/\r?\n/);
          if (isFormFieldEmpty('lyrics', formValues.lyrics)) {
            formValues.lyrics = lyrics;
            autoAppliedKeys.push(tuneKey);
          } else if (preferChordPro) {
            // ChordPro-preserved import is the default merge choice.
            formValues.lyrics = lyrics;
            autoAppliedKeys.push(tuneKey);
            if (!fieldValuesSemanticallyEqual(
              'words',
              String(baselineLyrics || '').split(/\r?\n/),
              lyricValue
            )) {
              suggestions.lyrics = attachCurrentValueChoice({
                key: 'words',
                formKey: 'lyrics',
                value: lyricValue,
                displayValue: lyrics,
              }, baselineLyrics, baselineLyrics, { preferImported: true });
            }
          } else if (!fieldValuesSemanticallyEqual(tuneKey, getTuneFieldValue(baseTune, tuneKey), getTuneFieldValue(imported, tuneKey))) {
            suggestions.lyrics = attachCurrentValueChoice({
              key: tuneKey,
              formKey: 'lyrics',
              value: cloneValue(getTuneFieldValue(imported, tuneKey)),
              displayValue: lyrics,
            }, baselineLyrics, baselineLyrics);
          } else if (suggestOnly && lyrics.trim()) {
            suggestions.lyrics = attachCurrentValueChoice({
              key: tuneKey,
              formKey: 'lyrics',
              value: cloneValue(getTuneFieldValue(imported, tuneKey)),
              displayValue: lyrics,
            }, baselineLyrics, baselineLyrics);
          }
        }
      }
      return;
    }

    const importedValue = getTuneFieldValue(imported, tuneKey);
    if (!importedFieldIsPresent(tuneKey, importedValue)) return;

    const formKey = formKeyForTuneKey(tuneKey);
    if (!formKey) return;

    const baseValue = getTuneFieldValue(baseTune, tuneKey);
    const currentFormValue = getFormFieldValue(formValues, formKey);

    if (!suggestOnly) {
      const autoKeys = getAutoAppliedImportFieldKeys(baseTune, imported);
      if (autoKeys.indexOf(tuneKey) >= 0) {
        formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
        autoAppliedKeys.push(tuneKey);
        return;
      }
    }

    if (fieldValuesSemanticallyEqual(tuneKey, baseValue, importedValue)) return;

    // Timing scaffold: always take a present import (false/empty is absent above).
    if (tuneKey === 'timingScaffold') {
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      return;
    }

    // Key signature: imported value is the default; keep Current as a revert choice.
    if (tuneKey === 'key') {
      const baselineKey = currentFormValue;
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      if (!isFormFieldEmpty(formKey, baselineKey)) {
        suggestions[formKey] = attachCurrentValueChoice({
          key: tuneKey,
          formKey: formKey,
          value: cloneValue(importedValue),
          displayValue: tuneValueToFormValue(tuneKey, importedValue),
        }, baselineKey, baselineDisplayForFormValue(formKey, baselineKey), { preferImported: true });
      }
      return;
    }

    // Tempo: imported value is the default when present; Current as revert.
    if (tuneKey === 'tempo') {
      const baselineTempo = currentFormValue;
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      if (!isFormFieldEmpty(formKey, baselineTempo)) {
        suggestions[formKey] = attachCurrentValueChoice({
          key: tuneKey,
          formKey: formKey,
          value: cloneValue(importedValue),
          displayValue: tuneValueToFormValue(tuneKey, importedValue),
        }, baselineTempo, baselineDisplayForFormValue(formKey, baselineTempo), { preferImported: true });
      }
      return;
    }

    // Fill empty listed fields even in suggestOnly (Import Review default).
    if (isFormFieldEmpty(formKey, currentFormValue) && AUTO_FILL_EMPTY_TUNE_KEYS[tuneKey]) {
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      return;
    }

    if (!suggestOnly && isFormFieldEmpty(formKey, currentFormValue)) {
      formValues = setFormFieldValue(formValues, formKey, tuneValueToFormValue(tuneKey, importedValue));
      autoAppliedKeys.push(tuneKey);
      return;
    }

    if (!suggestOnly && fieldValuesSemanticallyEqual(tuneKey, formValueAsTuneComparable(formKey, currentFormValue), importedValue)) {
      return;
    }

    suggestions[formKey] = attachCurrentValueChoice({
      key: tuneKey,
      formKey: formKey,
      value: cloneValue(importedValue),
      displayValue: tuneValueToFormValue(tuneKey, importedValue),
    }, currentFormValue, baselineDisplayForFormValue(formKey, currentFormValue));
  });

  return autoApplyInferredKeyFromChords(
    formValues,
    suggestions,
    autoAppliedKeys,
    baseTune,
    imported
  );
}

function formValueAsTuneComparable(formKey, value) {
  if (formKey === 'bookList' || formKey === 'tagList') {
    return parseListField(value);
  }
  if (formKey === 'notes') {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return { '1': { meta: '', notes: String(value || '').split(/\r?\n/) } };
  }
  if (formKey === 'lyrics') {
    return String(value || '').split(/\r?\n/);
  }
  if (formKey === 'aliases' || formKey === 'artists' || formKey === 'links' || formKey === 'genres') {
    return Array.isArray(value) ? value : [];
  }
  return value;
}

export function importSuggestionDiffersFromForm(formKey, suggestion, formValues) {
  if (!suggestion) return false;
  const values = formValues || emptyFormValues();
  const tuneKey = suggestion.key || formKey;
  let currentValue;
  if (formKey === 'notes') {
    currentValue = (values.voices && Object.keys(values.voices).length)
      ? values.voices
      : formValueAsTuneComparable('notes', values.notes);
  } else if (formKey === 'lyrics') {
    currentValue = formValueAsTuneComparable('lyrics', values.lyrics);
  } else {
    currentValue = formValueAsTuneComparable(formKey, values[formKey]);
  }
  if (fieldValuesSemanticallyEqual(tuneKey, currentValue, suggestion.value)) return false;

  const importedDisplay = suggestion.displayValue != null
    ? String(suggestion.displayValue).trim()
    : '';
  let currentText = '';
  if (formKey === 'notes') {
    currentText = notationTextFromTune({ voices: currentValue }).trim();
  } else if (formKey === 'lyrics') {
    currentText = String(values.lyrics || '').trim();
  } else if (formKey === 'bookList' || formKey === 'tagList') {
    currentText = parseListField(values[formKey]).join(', ');
    const importedList = Array.isArray(suggestion.value)
      ? suggestion.value.map(function(item) { return String(item).trim(); }).filter(Boolean).join(', ')
      : String(suggestion.displayValue || suggestion.value || '').trim();
    if (currentText && importedList && currentText.toLowerCase() === importedList.toLowerCase()) {
      return false;
    }
  } else if (Array.isArray(values[formKey])) {
    currentText = values[formKey].join(', ');
  } else {
    currentText = String(values[formKey] == null ? '' : values[formKey]).trim();
  }
  if (importedDisplay && currentText && importedDisplay === currentText) return false;
  return true;
}

export function applyImportSuggestion(formValues, formKey, suggestion) {
  const next = Object.assign({}, formValues || emptyFormValues());
  if (!suggestion) return next;
  if (formKey === 'links') {
    if (suggestion.source === 'current') {
      next.links = Array.isArray(suggestion.value) ? cloneValue(suggestion.value) : [];
      return next;
    }
    const links = Array.isArray(suggestion.value) ? suggestion.value : [];
    next.links = mergeImportedLinks(Array.isArray(next.links) ? next.links : [], links);
    return next;
  }
  if (formKey === 'notes') {
    if (suggestion.value && typeof suggestion.value === 'object' && !Array.isArray(suggestion.value)) {
      next.voices = cloneValue(suggestion.value);
      next.notes = notationTextFromTune({ voices: next.voices });
    } else {
      const text = suggestion.value == null ? '' : String(suggestion.value);
      const voices = Object.assign({}, next.voices || { '1': { meta: '', notes: [] } });
      const primaryKey = Object.keys(voices).sort()[0] || '1';
      voices[primaryKey] = Object.assign({}, voices[primaryKey] || { meta: '' }, {
        notes: text ? text.split(/\r?\n/) : [],
      });
      next.voices = voices;
      next.notes = text;
    }
    return next;
  }
  if (formKey === 'voices' && suggestion.value && typeof suggestion.value === 'object') {
    next.voices = cloneValue(suggestion.value);
    next.notes = notationTextFromTune({ voices: next.voices });
    return next;
  }
  if (formKey === 'lyrics') {
    if (Array.isArray(suggestion.value)) {
      next.lyrics = suggestion.value.join('\n');
    } else {
      next.lyrics = suggestion.value == null ? '' : String(suggestion.value);
    }
    return next;
  }
  if (formKey === 'bookList' || formKey === 'tagList') {
    if (Array.isArray(suggestion.value)) {
      next[formKey] = suggestion.value.join(', ');
    } else {
      next[formKey] = suggestion.value == null ? '' : String(suggestion.value);
    }
    return next;
  }
  const displayValue = suggestion.displayValue != null
    ? suggestion.displayValue
    : tuneValueToFormValue(suggestion.key, suggestion.value);
  // Prefer structured value when present (choice selection); fall back to display.
  if (suggestion.value !== undefined && suggestion.source === 'current') {
    next[formKey] = suggestion.value == null ? '' : cloneValue(suggestion.value);
  } else if (suggestion.value !== undefined && typeof suggestion.value !== 'object') {
    next[formKey] = cloneValue(suggestion.value);
  } else {
    next[formKey] = cloneValue(displayValue);
  }
  return next;
}

/**
 * Apply every pending import suggestion into the form (Accept all imported fields).
 * Returns { formValues, suggestions } with suggestions cleared for applied keys.
 */
export function acceptAllImportSuggestions(formValues, suggestions) {
  let nextForm = Object.assign({}, formValues || emptyFormValues());
  const nextSuggestions = Object.assign({}, suggestions || {});
  Object.keys(nextSuggestions).forEach(function(formKey) {
    const suggestion = nextSuggestions[formKey];
    if (!suggestion) return;
    // Prefer the imported choice when choices exist
    let toApply = suggestion;
    if (Array.isArray(suggestion.choices) && suggestion.choices.length) {
      const importedChoice = suggestion.choices.find(function(c) {
        return c && c.source !== 'current' && c.id !== 'current';
      });
      if (importedChoice) {
        toApply = Object.assign({}, suggestion, {
          value: importedChoice.value !== undefined ? importedChoice.value : suggestion.value,
          displayValue: importedChoice.preview != null ? importedChoice.preview : suggestion.displayValue,
          source: importedChoice.source || 'import',
        });
      }
    }
    nextForm = applyImportSuggestion(nextForm, formKey, toApply);
    delete nextSuggestions[formKey];
  });
  return { formValues: nextForm, suggestions: nextSuggestions };
}

/**
 * Clear pending import suggestions, keeping current form values (Keep all local).
 */
export function keepAllLocalImportSuggestions(formValues, suggestions) {
  return {
    formValues: Object.assign({}, formValues || emptyFormValues()),
    suggestions: {},
  };
}

export function applyInlineImportToForm(currentFormValues, importedTune) {
  const asTune = formValuesToTune(currentFormValues, {});
  return buildReviewFormState(asTune, importedTune, 'import');
}

/** Add-form file import: replace song fields from the new parse, keep draft books/tags/links. */
export function applyAddFormInlineImport(draftTune, importedTune) {
  const merged = mergeImportDraftTune(importedTune, draftTune);
  return buildReviewFormState(null, merged, 'create');
}

export function importedNotationText(importedTune) {
  return notationTextFromTune(importedTune || {});
}

export function importedLyricsText(importedTune) {
  return lyricsTextFromTune(importedTune || {});
}
