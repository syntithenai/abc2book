import { buildAbcWithNoteSpacing, stripEmbeddedChordsFromAbc, stripLyricLinesFromAbc } from '../noteSpacingUtils';
import { stripSectionMarkerChordsFromDisplayAbc } from '../chordSheetUtils';
import { parseVoiceMeta } from './voiceMeta';

/** Remove book/tag metadata lines that abcjs renders as text under the staff.
 *  Keeps only the first C: line so additional artists are not drawn as composer credits.
 */
export function stripNotationDisplayMetadata(abcText) {
  if (!abcText) return '';
  let seenComposer = false;
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('B:')) return false;
    if (/^H:/i.test(trimmed)) return false;
    if (trimmed.startsWith('N: AKA:')) return false;
    if (trimmed.startsWith('% abcbook-tags')) return false;
    if (trimmed.startsWith('%%abcbook-tags')) return false;
    if (trimmed.startsWith('% abcbook-albums')) return false;
    if (trimmed.startsWith('%%abcbook-albums')) return false;
    if (/^C:/i.test(trimmed)) {
      if (seenComposer) return false;
      seenComposer = true;
      return true;
    }
    return true;
  }).join('\n');
}

/**
 * Strip block lyrics (W:) from staff display ABC. Keeps note-aligned lyrics (w:).
 */
export function stripBlockLyricsFromDisplayAbc(abcText) {
  if (!abcText) return '';
  return String(abcText).split('\n').filter(function(line) {
    return !/^W:/.test(String(line || '').trim());
  }).join('\n');
}

/** Strip metadata and block lyrics for tune-view notation (keeps note-aligned w:). */
export function stripTuneViewNotationMeta(abcText) {
  if (!abcText) return '';
  return stripBlockLyricsFromDisplayAbc(stripNotationDisplayMetadata(abcText));
}

/**
 * Gig/print/practice staff headers: metadata strip plus title line removal.
 */
export function stripStaffNotationHeaders(abcText) {
  if (!abcText) return '';
  return stripNotationDisplayMetadata(abcText).split('\n').filter(function(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('T:')) return false;
    return true;
  }).join('\n');
}

/**
 * Staff chord display policy (G6/G7): strip all embedded chords when annotate is off;
 * when on, keep real chords but remove section-marker label chords.
 */
export function applyStaffChordDisplayPolicy(staffAbc, options) {
  const opts = options || {};
  const abc = String(staffAbc == null ? '' : staffAbc);
  if (!opts.chordsAnnotate) {
    if (opts.stripEmbeddedChordsWhenOff && opts.abcTools) {
      return stripEmbeddedChordsFromAbc(abc, opts.abcTools);
    }
    return abc;
  }
  return stripSectionMarkerChordsFromDisplayAbc(abc);
}

/** Prepare ABC for gig/print/practice staff rendering after note-spacing build. */
export function prepareGigStaffDisplayAbc(displayAbc, tunebook, chordsAnnotate) {
  let staffAbc = stripStaffNotationHeaders(displayAbc);
  staffAbc = stripLyricLinesFromAbc(staffAbc);
  return applyStaffChordDisplayPolicy(staffAbc, {
    chordsAnnotate: chordsAnnotate,
    stripEmbeddedChordsWhenOff: true,
    abcTools: tunebook && tunebook.abcTools,
  });
}

/** Prepare ABC for MusicSingle / TuneSingleViewDialog notation panels. */
export function prepareTuneViewNotationAbc(jsonAbc, chordsAnnotate) {
  const raw = stripTuneViewNotationMeta(jsonAbc);
  return applyStaffChordDisplayPolicy(raw, { chordsAnnotate: chordsAnnotate });
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

/** Preview ABC for one or more voices with independent note bodies. */
export function buildAbcPreviewFromBodies(tune, tunebook, voiceKeys, bodyTextsByKey, options) {
  if (!tune || !tunebook || !voiceKeys || !voiceKeys.length) return '';
  const opts = options || {};
  const tuneCopy = JSON.parse(JSON.stringify(tune));
  if (!tuneCopy.voices) return '';
  tuneCopy.voices = {};
  voiceKeys.forEach(function(voiceKey, index) {
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
  const abc = notationDisplayAbc(tuneCopy, tunebook);
  if (opts.stripSectionMarkerChords) {
    return applyStaffChordDisplayPolicy(abc, { chordsAnnotate: true });
  }
  return abc;
}

function notationDisplayAbc(tune, tunebook, options) {
  if (!tune || !tunebook || !tunebook.abcTools) return '';
  const opts = options || {};
  return stripNotationDisplayMetadata(
    buildAbcWithNoteSpacing(tune, tunebook.abcTools, {
      includeLyrics: opts.includeLyrics !== false,
    })
  );
}

/** Voice label for UI: display name from meta when set, otherwise Voice N from the voice key. */
export function voiceDisplayLabel(tune, voiceKey) {
  if (!voiceKey) return '';
  if (tune && tune.voices && tune.voices[voiceKey]) {
    const parsed = parseVoiceMeta(tune.voices[voiceKey].meta);
    if (parsed.name && parsed.name !== '[object Object]') return parsed.name;
  }
  return 'Voice ' + voiceKey;
}

/**
 * Map an abcjs click (startChar in the rendered multi-voice ABC) to the matching
 * displayed voice key and cursor offset within that voice's note textarea.
 * displayedVoiceKeys are the original tune keys in display order (V:1, V:2, …).
 */
export function mapAbcClickToVoiceCursor(fullAbc, displayedVoiceKeys, analysisVoiceIndex, startChar) {
  const keys = (displayedVoiceKeys || []).slice();
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
