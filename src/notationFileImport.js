import { buildImportContext, dispatchAddImport } from './addImportDispatch';
import { notationTextFromTune } from './importReviewFieldUtils';
import { openMidiImportWizard } from './midiImportWizard';

const NOTATION_MUSICAL_FIELDS = ['key', 'meter', 'tempo', 'noteLength'];

export function tuneHasNotation(tune) {
  if (String(notationTextFromTune(tune || {})).trim()) return true;
  if (!tune) return false;
  if (Array.isArray(tune.notes) && tune.notes.some(function(line) {
    return String(line || '').trim();
  })) {
    return true;
  }
  return typeof tune.notes === 'string' && !!tune.notes.trim();
}

export function importedTuneFromCandidate(candidate, tunebook) {
  if (candidate && candidate.tune && typeof candidate.tune === 'object') {
    return candidate.tune;
  }
  const abcText = candidate && candidate.abc ? String(candidate.abc) : '';
  if (!abcText || !tunebook || !tunebook.abcTools || typeof tunebook.abcTools.abc2json !== 'function') {
    return null;
  }
  return tunebook.abcTools.abc2json(abcText);
}

/**
 * Keep the current tune's identity and personal fields; replace notation
 * (voices/notes plus key/meter/tempo when the import provides them).
 */
export function applyImportedNotationToTune(currentTune, importedTune) {
  const current = currentTune && typeof currentTune === 'object' ? currentTune : {};
  const imported = importedTune && typeof importedTune === 'object' ? importedTune : {};
  const next = Object.assign({}, current);
  next.id = current.id;
  if (imported.voices) next.voices = imported.voices;
  if (imported.notes != null) next.notes = imported.notes;
  NOTATION_MUSICAL_FIELDS.forEach(function(field) {
    if (imported[field] != null && String(imported[field]).trim() !== '') {
      next[field] = imported[field];
    }
  });
  if (imported.srcUrl && !next.srcUrl) next.srcUrl = imported.srcUrl;
  return next;
}

export function tagCandidatesForCurrentTune(candidates, currentTuneId) {
  if (!currentTuneId) return Array.isArray(candidates) ? candidates.slice() : [];
  return (candidates || []).map(function(candidate) {
    return Object.assign({}, candidate, { mergeTargetId: currentTuneId });
  });
}

export function planNotationFileImport(result, options) {
  const opts = options || {};
  if (!result || result.action === 'error') {
    return {
      action: 'error',
      message: (result && result.message) || 'Import failed.',
    };
  }
  if (result.action === 'audio' || result.action === 'video') {
    return {
      action: 'error',
      message: 'Choose a notation file (ABC, MusicXML, MIDI, or MuseScore).',
    };
  }
  if (result.action === 'batch' && result.batchSummary) {
    return { action: 'batch', batchSummary: result.batchSummary };
  }
  if (result.action !== 'review') {
    return {
      action: 'error',
      message: 'Could not import that file as notation.',
    };
  }
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  if (!candidates.length) {
    return { action: 'error', message: 'No tunes found in that import.' };
  }
  const needsReview = candidates.length > 1 || tuneHasNotation(opts.currentTune);
  if (needsReview) {
    return {
      action: 'review',
      candidates: tagCandidatesForCurrentTune(candidates, opts.currentTuneId),
    };
  }
  return { action: 'apply', candidate: candidates[0] };
}

async function resolveImportResult(file, ctx, options) {
  let result = await dispatchAddImport(file, ctx);
  if (result && result.action === 'midiWizard' && result.pendingMidi) {
    const wizardResult = await openMidiImportWizard({
      pendingMidi: result.pendingMidi,
      file: result.pendingMidi.file,
      sourceUrl: result.pendingMidi.sourceUrl,
      accessToken: options.token && options.token.access_token,
    });
    result = {
      action: 'review',
      candidates: (wizardResult && wizardResult.candidates) || [],
    };
  }
  return result;
}

/**
 * Parse a notation file (MIDI goes through the MIDI import wizard) and decide
 * whether to apply into the current tune or open import-review merge.
 */
export async function runNotationFileImport(file, options) {
  const opts = options || {};
  if (!file) {
    return { action: 'error', message: 'No file selected.' };
  }
  const ctx = buildImportContext({
    resolverAvailable: opts.resolverAvailable,
    token: opts.token,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    book: opts.book || '',
    tunes: opts.tunes || {},
    stayOnForm: true,
    maxCandidates: 1,
    entryPoint: 'editor',
    currentTuneId: opts.currentTuneId,
  });
  try {
    const result = await resolveImportResult(file, ctx, opts);
    return planNotationFileImport(result, opts);
  } catch (e) {
    if (e && e.message && String(e.message).indexOf('cancelled') !== -1) {
      return { action: 'cancelled' };
    }
    return { action: 'error', message: (e && e.message) || 'Import failed.' };
  }
}
