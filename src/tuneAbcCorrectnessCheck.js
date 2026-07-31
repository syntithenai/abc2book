import abcjs from 'abcjs';
import { abcForAbcjs } from './melodyBarlineNormalize';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { formatTuneDisplayName } from './tuneDisplayName';

function issue(code, message, severity, field) {
  return {
    code: code,
    message: message,
    severity: severity || 'error',
    field: field || null,
  };
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function abcHasHeader(abc, header) {
  const prefix = header + ':';
  return String(abc || '').split('\n').some(function(line) {
    return line.trim().startsWith(prefix);
  });
}

function normalizeNotesText(text) {
  return String(text || '').replace(/\s+/g, '');
}

export function checkTuneAbcCorrectness(tune, options) {
  const opts = options || {};
  const abcTools = opts.abcTools;
  if (!tune || !tune.id || !abcTools) return null;

  const issues = [];
  const abcText = typeof opts.abcText === 'string'
    ? opts.abcText
    : abcTools.json2abc(tune);
  const abcForParse = abcForAbcjs(abcText);
  const noteLines = getNoteLines(tune);

  if (noteLines.length === 0) {
    issues.push(issue('empty_voice', 'Music notation has no note lines', 'error', 'voices'));
  }

  if (!abcHasHeader(abcText, 'M')) {
    issues.push(issue('missing_meter_header', 'ABC is missing M: (time signature) header', 'warning', 'meter'));
  }
  if (!abcHasHeader(abcText, 'K')) {
    issues.push(issue('missing_key_header', 'ABC is missing K: (key) header', 'warning', 'key'));
  }

  try {
    const parsed = abcjs.parseOnly(abcForParse);
    if (!parsed || parsed.length === 0) {
      issues.push(issue('parse_failure', 'ABC notation failed to parse', 'error', 'voices'));
    }
  } catch (err) {
    issues.push(issue('parse_failure', 'ABC notation failed to parse', 'error', 'voices'));
  }

  if (!opts.skipRenderAbc) {
    try {
      const visual = abcjs.renderAbc(document.createElement('div'), abcForParse, { add_classes: true });
      const warnings = visual && visual.warnings ? visual.warnings : [];
      warnings.forEach(function(warning) {
        const text = warning && warning.message ? warning.message : String(warning);
        issues.push(issue('render_warning', text, 'warning', 'voices'));
      });
    } catch (err) {
      issues.push(issue('render_failure', 'ABC could not be rendered', 'error', 'voices'));
    }
  }

  if (typeof opts.parseAndRender === 'function') {
    try {
      const before = abcTools.justNotesNoMeta(abcText.trim());
      const rerendered = opts.parseAndRender(abcText);
      const after = abcTools.justNotesNoMeta(String(rerendered || '').trim());
      if (normalizeNotesText(before) !== normalizeNotesText(after)) {
        issues.push(issue('round_trip_drift', 'Notation changes when normalized through abcjs', 'warning', 'voices'));
      }
    } catch (err) {}
  }

  if (issues.length === 0) return null;

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    composer: tune.composer || '',
    abcSnippet: noteLines.slice(0, 3).join('\n'),
    issues: issues,
  };
}

export function checkTunesAbcCorrectness(tunes, options) {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map(function(tune) { return checkTuneAbcCorrectness(tune, options); })
    .filter(Boolean);
}

export function fixTuneAbcHeaders(tune, abcTools) {
  if (!tune || !abcTools) return tune;
  const next = Object.assign({}, tune);
  if (!next.meter || !String(next.meter).trim()) {
    next.meter = '4/4';
  }
  if (!next.key || !String(next.key).trim()) {
    next.key = 'C';
  }
  if (!next.noteLength || !String(next.noteLength).trim()) {
    next.noteLength = '1/8';
  }
  return next;
}

const NOTATION_HEADER_FIELDS = [
  { header: 'M', field: 'meter', normalize: function(value, abcTools) {
    return typeof abcTools.normalizeMeter === 'function'
      ? abcTools.normalizeMeter(value)
      : value;
  } },
  { header: 'K', field: 'key' },
  { header: 'L', field: 'noteLength' },
  { header: 'Q', field: 'tempo', normalize: function(value, abcTools) {
    return typeof abcTools.cleanTempo === 'function'
      ? abcTools.cleanTempo(value)
      : value;
  } },
];

export function applyNotationHeadersFromAbc(tune, abcText, abcTools) {
  if (!tune || !abcTools || !abcText) return tune;
  const next = Object.assign({}, tune);
  let changed = false;

  NOTATION_HEADER_FIELDS.forEach(function(entry) {
    const raw = String(abcTools.getMetaValueFromAbc(entry.header, abcText) || '').trim();
    if (!raw) return;
    const value = entry.normalize ? entry.normalize(raw, abcTools) : raw;
    if (String(next[entry.field] || '') !== String(value)) {
      next[entry.field] = value;
      changed = true;
    }
  });

  return changed ? next : tune;
}

function notationStateEqual(beforeTune, afterTune) {
  if (!beforeTune || !afterTune) return false;
  return JSON.stringify(beforeTune.voices) === JSON.stringify(afterTune.voices)
    && String(beforeTune.meter || '') === String(afterTune.meter || '')
    && String(beforeTune.key || '') === String(afterTune.key || '')
    && String(beforeTune.noteLength || '') === String(afterTune.noteLength || '')
    && String(beforeTune.tempo || '') === String(afterTune.tempo || '');
}

/**
 * Re-render notation through abcjs and apply only voice note lines plus
 * notation headers (M/K/L/Q). Bibliographic and app fields are preserved.
 */
export function normalizeTuneAbc(tune, abcTools, parseAndRender) {
  if (!tune || !abcTools || typeof parseAndRender !== 'function') return null;
  const abcText = abcTools.json2abc(tune);
  let rerendered;
  try {
    rerendered = parseAndRender(abcText);
  } catch (err) {
    return null;
  }
  if (!rerendered) return null;

  const parsed = abcTools.abc2json(rerendered);
  if (!parsed || !parsed.voices) return null;

  let next = Object.assign({}, tune, {
    voices: parsed.voices,
  });
  next = applyNotationHeadersFromAbc(next, rerendered, abcTools);

  if (notationStateEqual(tune, next)) return null;
  return next;
}
