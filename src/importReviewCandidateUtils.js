import {
  TUNE_IMPORT_FIELD_DEFS,
  fieldValuesSemanticallyEqual,
  importedFieldIsPresent,
  formatTuneFieldValue,
  linkCompareKey,
} from './tuneImportMergeUtils'

export function mergeDraftTune(importedTune, draftTune) {
  // Start from import, then overlay only non-empty draft fields so a blank
  // add-form draft cannot wipe ABC title/notes/etc.
  const imported = importedTune || {};
  const draft = draftTune || {};
  const next = Object.assign({}, imported);
  Object.keys(draft).forEach(function(key) {
    if (!draftFieldHasValue(key, draft[key])) return;
    next[key] = draft[key];
  });
  return next;
}

/**
 * Add-form file re-import: take the new parse as the song body, but keep
 * book/tag/link attachments the user already chose on the draft.
 */
export function mergeImportDraftTune(importedTune, draftTune) {
  const imported = importedTune || {};
  const draft = draftTune || {};
  const next = Object.assign({}, imported);
  if (draft.id) next.id = draft.id;
  next.books = unionDraftStringLists(imported.books, draft.books);
  next.tags = unionDraftStringLists(imported.tags, draft.tags);
  if (draftFieldHasValue('links', draft.links)) {
    next.links = Array.isArray(draft.links) ? draft.links.slice() : draft.links;
  }
  if (draftFieldHasValue('tuneFiles', draft.tuneFiles)) {
    next.tuneFiles = draft.tuneFiles.map(function(file) { return Object.assign({}, file); });
  }
  if (draftFieldHasValue('activeFile', draft.activeFile)) {
    next.activeFile = draft.activeFile;
  }
  return next;
}

function unionDraftStringLists(a, b) {
  const seen = {};
  const out = [];
  function add(items) {
    (Array.isArray(items) ? items : []).forEach(function(item) {
      const text = String(item || '').trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(text);
    });
  }
  add(a);
  add(b);
  return out;
}

function draftFieldHasValue(key, value) {
  if (value == null) return false;
  if (typeof value === 'string') return !!value.trim();
  if (typeof value === 'number') return !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (key === 'voices' && typeof value === 'object') {
    return Object.keys(value).some(function(voiceKey) {
      const voice = value[voiceKey] || {};
      const notes = Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '');
      return !!String(notes || '').trim() || !!String(voice.meta || '').trim();
    });
  }
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function freshTuneId() {
  return 'tune-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

export function applyDraftIdentityHints(tune, draftTune) {
  const next = Object.assign({}, tune || {});
  if (!String(next.name || '').trim() && draftTune && draftTune.name) {
    next.name = draftTune.name;
  }
  if (!String(next.composer || '').trim() && draftTune && draftTune.composer) {
    next.composer = draftTune.composer;
  }
  return next;
}

export function asIndependentReviewCandidate(candidate, draft) {
  const source = candidate || {};
  const tuneIn = source.tune || {};
  const hinted = applyDraftIdentityHints(tuneIn, draft && draft.tune);
  const links = Array.isArray(tuneIn.links) ? tuneIn.links.slice() : [];
  const existingId = String(tuneIn.id || '').trim();
  return Object.assign({}, source, {
    tune: Object.assign({}, hinted, {
      id: existingId || freshTuneId(),
      links: links,
    }),
    mergeTargetId: source.mergeTargetId != null ? source.mergeTargetId : null,
  });
}

function cloneValue(value) {
  if (value === null || value === undefined) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (e) {
    return value
  }
}

const TUNE_KEY_TO_FORM = {
  name: 'title',
  composer: 'artist',
  key: 'keyName',
  words: 'lyrics',
  wLines: 'lyrics',
  voices: 'notes',
}

function formKeyForTuneKey(tuneKey) {
  if (TUNE_KEY_TO_FORM[tuneKey]) return TUNE_KEY_TO_FORM[tuneKey]
  return tuneKey
}

function getTuneFieldValue(tune, tuneKey) {
  if (!tune) return undefined
  if (tuneKey === 'words' || tuneKey === 'wLines') {
    if (Array.isArray(tune.wLines) && tune.wLines.length) return tune.wLines
    if (Array.isArray(tune.words) && tune.words.length) return tune.words
    return undefined
  }
  return tune[tuneKey]
}

function sourceLabel(candidate) {
  if (!candidate) return 'import'
  if (candidate.sourceKind) return String(candidate.sourceKind)
  return 'import'
}

/**
 * All field-lookup job ids linked to a review candidate (singular + array).
 */
export function fieldLookupJobIdsForCandidate(candidate) {
  if (!candidate) return []
  const ids = []
  const seen = {}
  function push(id) {
    const key = String(id || '').trim()
    if (!key || seen[key]) return
    seen[key] = true
    ids.push(key)
  }
  if (Array.isArray(candidate.fieldLookupJobIds)) {
    candidate.fieldLookupJobIds.forEach(push)
  }
  push(candidate.fieldLookupJobId)
  return ids
}

export function fieldLookupKindsForCandidate(candidate) {
  if (!candidate) return []
  const kinds = []
  const seen = {}
  function push(kind) {
    const key = String(kind || '').trim()
    if (!key || seen[key]) return
    seen[key] = true
    kinds.push(key)
  }
  if (Array.isArray(candidate.fieldLookupKinds)) {
    candidate.fieldLookupKinds.forEach(push)
  }
  push(candidate.fieldLookupKind)
  return kinds
}

function choiceId(prefix, index) {
  return String(prefix || 'choice') + '-' + index
}

function makeChoice(tuneKey, value, source, index) {
  const formKey = formKeyForTuneKey(tuneKey)
  const display = formatTuneFieldValue(tuneKey === 'voices' ? 'voices' : tuneKey, value)
  return {
    id: choiceId(source || formKey, index),
    label: source ? ('From ' + source) : 'Imported',
    preview: display != null && String(display).trim() !== '' ? String(display) : '(empty)',
    value: cloneValue(value),
    source: source || 'import',
  }
}

function pushDistinctChoice(choices, tuneKey, value, source) {
  if (!importedFieldIsPresent(tuneKey, value)) return
  const exists = choices.some(function(choice) {
    return fieldValuesSemanticallyEqual(tuneKey, choice.value, value)
  })
  if (exists) return
  choices.push(makeChoice(tuneKey, value, source, choices.length))
}

function mergeListField(a, b, keyFn) {
  const out = []
  const seen = {}
  function add(item) {
    const key = keyFn ? keyFn(item) : String(item || '').trim().toLowerCase()
    if (!key || seen[key]) return
    seen[key] = true
    out.push(cloneValue(item))
  }
  ;(Array.isArray(a) ? a : []).forEach(add)
  ;(Array.isArray(b) ? b : []).forEach(add)
  return out
}

function collectFieldChoicesFromTune(tune, source, into) {
  if (!tune || !into) return
  TUNE_IMPORT_FIELD_DEFS.forEach(function(def) {
    const tuneKey = def.key
    if (tuneKey === 'notes') return
    const formKey = formKeyForTuneKey(tuneKey)
    // Collapse words/wLines onto lyrics form key once.
    if ((tuneKey === 'words' || tuneKey === 'wLines') && into[formKey] && into[formKey].length) {
      const value = getTuneFieldValue(tune, tuneKey)
      pushDistinctChoice(into[formKey], 'words', value, source)
      return
    }
    const value = getTuneFieldValue(tune, tuneKey)
    if (!importedFieldIsPresent(tuneKey, value)) return
    if (!into[formKey]) into[formKey] = []
    const compareKey = (tuneKey === 'words' || tuneKey === 'wLines') ? 'words' : tuneKey
    pushDistinctChoice(into[formKey], compareKey, value, source)
  })
}

/**
 * Merge other candidates into survivor without dropping alternate field values.
 * Alternates live on survivor.fieldChoices[formKey]; survivor.tune keeps defaults.
 */
export function coalesceImportCandidates(survivor, others) {
  if (!survivor) return survivor
  const list = Array.isArray(others) ? others.filter(Boolean) : []
  if (list.length === 0) {
    return normalizeCoalescedCandidate(survivor)
  }

  const next = Object.assign({}, survivor, {
    tune: Object.assign({}, survivor.tune || {}),
  })
  const fieldChoices = Object.assign({}, survivor.fieldChoices || {})
  collectFieldChoicesFromTune(next.tune, sourceLabel(survivor), fieldChoices)

  const jobIds = fieldLookupJobIdsForCandidate(survivor)
  const kinds = fieldLookupKindsForCandidate(survivor)
  const coalescedSourceKinds = Array.isArray(survivor.coalescedSourceKinds)
    ? survivor.coalescedSourceKinds.slice()
    : (survivor.sourceKind ? [survivor.sourceKind] : [])
  const seenKinds = {}
  coalescedSourceKinds.forEach(function(kind) { seenKinds[kind] = true })

  list.forEach(function(other) {
    const otherTune = other.tune || {}
    const otherSource = sourceLabel(other)
    collectFieldChoicesFromTune(otherTune, otherSource, fieldChoices)

    TUNE_IMPORT_FIELD_DEFS.forEach(function(def) {
      const tuneKey = def.key
      if (tuneKey === 'notes') return
      const otherValue = getTuneFieldValue(otherTune, tuneKey)
      if (!importedFieldIsPresent(tuneKey, otherValue)) return

      if (tuneKey === 'artists' || tuneKey === 'aliases') {
        next.tune[tuneKey] = mergeListField(next.tune[tuneKey], otherValue)
        return
      }
      if (tuneKey === 'links') {
        next.tune.links = mergeListField(next.tune.links, otherValue, linkCompareKey)
        return
      }
      if (tuneKey === 'books' || tuneKey === 'tags') {
        next.tune[tuneKey] = mergeListField(next.tune[tuneKey], otherValue)
        return
      }

      const current = getTuneFieldValue(next.tune, tuneKey)
      if (!importedFieldIsPresent(tuneKey, current)) {
        if (tuneKey === 'words' || tuneKey === 'wLines') {
          next.tune.words = cloneValue(otherValue)
          next.tune.wLines = cloneValue(otherValue)
        } else {
          next.tune[tuneKey] = cloneValue(otherValue)
        }
      }
    })

    fieldLookupJobIdsForCandidate(other).forEach(function(id) {
      if (jobIds.indexOf(id) < 0) jobIds.push(id)
    })
    fieldLookupKindsForCandidate(other).forEach(function(kind) {
      if (kinds.indexOf(kind) < 0) kinds.push(kind)
    })
    if (other.sourceKind && !seenKinds[other.sourceKind]) {
      seenKinds[other.sourceKind] = true
      coalescedSourceKinds.push(other.sourceKind)
    }
  })

  next.fieldChoices = fieldChoices
  next.fieldLookupJobIds = jobIds
  next.fieldLookupKinds = kinds
  next.fieldLookupJobId = jobIds[0] || next.fieldLookupJobId || null
  next.fieldLookupKind = kinds[0] || next.fieldLookupKind || null
  next.coalescedSourceKinds = coalescedSourceKinds
  if (coalescedSourceKinds.length > 1) {
    next.sourceKind = next.sourceKind && String(next.sourceKind).indexOf('search-') === 0
      ? 'search-multi'
      : (next.sourceKind || 'multi')
  }
  next.skipEnrich = !!(next.skipEnrich || list.some(function(item) { return item.skipEnrich }))

  return normalizeCoalescedCandidate(next)
}

function normalizeCoalescedCandidate(candidate) {
  if (!candidate) return candidate
  const jobIds = fieldLookupJobIdsForCandidate(candidate)
  const kinds = fieldLookupKindsForCandidate(candidate)
  return Object.assign({}, candidate, {
    fieldLookupJobIds: jobIds,
    fieldLookupKinds: kinds,
    fieldLookupJobId: jobIds[0] || candidate.fieldLookupJobId || null,
    fieldLookupKind: kinds[0] || candidate.fieldLookupKind || null,
    fieldChoices: candidate.fieldChoices && typeof candidate.fieldChoices === 'object'
      ? candidate.fieldChoices
      : {},
    coalescedSourceKinds: Array.isArray(candidate.coalescedSourceKinds)
      ? candidate.coalescedSourceKinds
      : (candidate.sourceKind ? [candidate.sourceKind] : []),
  })
}
