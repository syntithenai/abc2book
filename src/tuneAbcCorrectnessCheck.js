import abcjs from 'abcjs';
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
    const parsed = abcjs.parseOnly(abcText);
    if (!parsed || parsed.length === 0) {
      issues.push(issue('parse_failure', 'ABC notation failed to parse', 'error', 'voices'));
    }
  } catch (err) {
    issues.push(issue('parse_failure', 'ABC notation failed to parse', 'error', 'voices'));
  }

  if (!opts.skipRenderAbc) {
    try {
      const visual = abcjs.renderAbc(document.createElement('div'), abcText, { add_classes: true });
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

export function normalizeTuneAbc(tune, abcTools, parseAndRender) {
  if (!tune || !abcTools || typeof parseAndRender !== 'function') return null;
  const abcText = abcTools.json2abc(tune);
  const rerendered = parseAndRender(abcText);
  const json = abcTools.abc2json(rerendered);
  json.id = tune.id;
  return json;
}
