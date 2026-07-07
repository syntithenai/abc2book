import { buildAbcWithNoteSpacing } from '../noteSpacingUtils';

/** Remove book/tag metadata lines that abcjs renders as text under the staff. */
export function stripNotationDisplayMetadata(abcText) {
  if (!abcText) return '';
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('B:')) return false;
    if (trimmed.startsWith('N: AKA:')) return false;
    if (trimmed.startsWith('% abcbook-tags')) return false;
    return true;
  }).join('\n');
}

function notationDisplayAbc(tune, tunebook) {
  if (!tune || !tunebook || !tunebook.abcTools) return '';
  // Include syllable-aligned lyrics under the staff; keep embedded chord symbols.
  return stripNotationDisplayMetadata(
    buildAbcWithNoteSpacing(tune, tunebook.abcTools, { includeLyrics: true })
  );
}

/** Build ABC for editor display: active voice only, with live edits merged. */
export function buildEditorDisplayAbc(tune, tunebook, voiceKey, liveVoiceBody) {
  if (!tune || !tunebook || !tunebook.abcTools) return '';
  const tuneCopy = JSON.parse(JSON.stringify(tune));

  if (!voiceKey || !tuneCopy.voices || !tuneCopy.voices[voiceKey]) {
    return notationDisplayAbc(tuneCopy, tunebook);
  }

  const voice = tuneCopy.voices[voiceKey];
  if (!Array.isArray(voice.notes)) {
    voice.notes = voice.notes ? [String(voice.notes)] : [''];
  }
  if (liveVoiceBody != null) {
    const lines = String(liveVoiceBody).split('\n');
    voice.notes = lines.length ? lines : [''];
  }
  if (voice.notes.length === 0) voice.notes = [''];

  tuneCopy.voices = {};
  tuneCopy.voices[voiceKey] = voice;

  return notationDisplayAbc(tuneCopy, tunebook);
}

/** Preview ABC for ABC view pane using stored note lines with forced line breaks. */
export function buildAbcPreviewFromBody(tune, tunebook, voiceKey, bodyText) {
  if (!tune || !tunebook || !voiceKey) return '';
  return buildAbcPreviewFromBodies(tune, tunebook, [voiceKey], { [voiceKey]: bodyText });
}

/** Placeholder body so abcjs renders an empty staff (display only; not saved). */
export const EMPTY_STAFF_PLACEHOLDER = 'z4 |]';

export function isEmptyVoiceBody(bodyText) {
  return !String(bodyText || '').trim();
}

export function withStaffDisplayPlaceholder(bodyText) {
  return isEmptyVoiceBody(bodyText) ? EMPTY_STAFF_PLACEHOLDER : bodyText;
}

function voiceBodyLines(bodyText) {
  const lines = String(bodyText || '').split('\n');
  return lines.length ? lines : [''];
}

function sortVoiceKeys(voiceKeys) {
  return voiceKeys.slice().sort(function(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

/** Preview ABC for one or more voices with independent note bodies. */
export function buildAbcPreviewFromBodies(tune, tunebook, voiceKeys, bodyTextsByKey, options) {
  if (!tune || !tunebook || !voiceKeys || !voiceKeys.length) return '';
  const opts = options || {};
  const tuneCopy = JSON.parse(JSON.stringify(tune));
  if (!tuneCopy.voices) return '';
  tuneCopy.voices = {};
  sortVoiceKeys(voiceKeys).forEach(function(voiceKey, index) {
    if (!tune.voices || !tune.voices[voiceKey]) return;
    const voiceMeta = tune.voices[voiceKey];
    const displayKey = String(index + 1);
    let body = bodyTextsByKey && bodyTextsByKey[voiceKey];
    if (opts.staffPlaceholder) body = withStaffDisplayPlaceholder(body);
    tuneCopy.voices[displayKey] = Object.assign({}, voiceMeta, {
      notes: voiceBodyLines(body),
    });
  });
  if (!Object.keys(tuneCopy.voices).length) return '';
  return notationDisplayAbc(tuneCopy, tunebook);
}

/** Voice label for UI: meta text when set, otherwise Voice N from the voice key. */
export function voiceDisplayLabel(tune, voiceKey) {
  if (!voiceKey) return '';
  if (tune && tune.voices && tune.voices[voiceKey]) {
    const meta = String(tune.voices[voiceKey].meta || '').trim();
    if (meta) return meta;
  }
  return 'Voice ' + voiceKey;
}

/**
 * Map an abcjs click (startChar in the rendered multi-voice ABC) to the matching
 * displayed voice key and cursor offset within that voice's note textarea.
 * displayedVoiceKeys are the original tune keys in display order (V:1, V:2, …).
 */
export function mapAbcClickToVoiceCursor(fullAbc, displayedVoiceKeys, analysisVoiceIndex, startChar) {
  const keys = sortVoiceKeys(displayedVoiceKeys || []);
  if (!keys.length) return null;
  const voiceIdx = typeof analysisVoiceIndex === 'number' && analysisVoiceIndex >= 0
    ? analysisVoiceIndex
    : 0;
  const voiceKey = keys[voiceIdx];
  if (!voiceKey) return null;

  const displayVoiceNum = String(voiceIdx + 1);
  const abc = String(fullAbc || '');
  const lines = abc.split('\n');
  let pos = 0;
  let bodyStart = -1;
  let bodyEnd = abc.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLen = line.length + (i < lines.length - 1 ? 1 : 0);
    const vMatch = line.match(/^V:(\S+)/);
    if (vMatch) {
      if (bodyStart >= 0) {
        bodyEnd = pos;
        break;
      }
      if (vMatch[1] === displayVoiceNum) {
        bodyStart = pos + line.length + (i < lines.length - 1 ? 1 : 0);
      }
    } else if (bodyStart >= 0 && (/^W:/i.test(line) || /^% abcbook-/.test(line))) {
      bodyEnd = pos;
      break;
    }
    pos += lineLen;
  }

  if (bodyStart < 0) return { voiceKey: voiceKey, offset: 0 };

  const charPos = typeof startChar === 'number' ? startChar : bodyStart;
  const offset = Math.max(0, Math.min(bodyEnd, charPos) - bodyStart);
  return { voiceKey: voiceKey, offset: offset };
}
