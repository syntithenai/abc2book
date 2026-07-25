import {
  buildVoiceProgramPrefix,
  displayNameForMidiTrack,
  isGenericMidiTrackName,
} from './midiTrackNaming';

const VOICE_META_RE = /^V:(\d+)\b(.*)$/;

export function clefForMidiTrack(track) {
  if (!track) return 'treble';
  if (track.isDrum || track.is_drum) return 'perc';
  const role = track.roleHint || track.role_hint || '';
  if (role === 'bass') return 'bass';
  return 'treble';
}

function safeName(name) {
  return String(name || '').replace(/"/g, '').trim();
}

/**
 * Ordered voice descriptors for ABC V:1, V:2, … matching note_events import order.
 */
export function voiceDescriptorsFromProfile(profile, trackIds) {
  const tracks = (profile && profile.tracks) || [];
  const byIndex = {};
  tracks.forEach(function(track) {
    byIndex[track.index] = track;
  });

  const ids = trackIds && trackIds.length
    ? trackIds.slice()
    : tracks
      .filter(function(track) { return !track.is_drum && (track.note_count || 0) > 0; })
      .sort(function(a, b) { return (b.note_count || 0) - (a.note_count || 0); })
      .map(function(track) { return track.index; });

  return ids.map(function(trackIndex, index) {
    const track = byIndex[trackIndex];
    if (!track) return null;
    return {
      id: index + 1,
      name: track.name,
      program: track.program,
      isDrum: !!track.is_drum,
      roleHint: track.role_hint || 'unknown',
    };
  }).filter(Boolean);
}

function buildVoiceMetaLine(voiceId, voice) {
  const name = safeName(displayNameForMidiTrack(voice));
  const clef = clefForMidiTrack(voice);
  return 'V:' + voiceId + ' nm="' + name + '" clef=' + clef;
}

function stripProgramLines(lines) {
  return lines.filter(function(line) {
    return !/^%%MIDI program\s+\d+/i.test(line.trim());
  });
}

function voiceIdsInAbc(lines) {
  const ids = [];
  lines.forEach(function(line) {
    const match = line.trim().match(VOICE_META_RE);
    if (match) {
      ids.push(parseInt(match[1], 10));
    }
  });
  return ids;
}

/**
 * Rename generic Track N voice headers, set clefs, and inject %%MIDI program lines.
 */
export function applyMidiProfileVoiceNamesToAbc(abc, profile, options) {
  const text = String(abc || '').trim();
  if (!text || !profile) return text;

  const opts = options || {};
  const voices = voiceDescriptorsFromProfile(profile, opts.trackIds);
  if (!voices.length) return text;

  const lines = text.split('\n');
  const voiceIds = voiceIdsInAbc(lines);
  const voiceById = {};
  voices.forEach(function(voice) {
    voiceById[voice.id] = voice;
  });

  // If xml2abc emitted fewer/more voices, align by position.
  if (voiceIds.length && voiceIds.length !== voices.length) {
    voiceIds.forEach(function(voiceId, index) {
      if (voices[index]) {
        voiceById[voiceId] = Object.assign({}, voices[index], { id: voiceId });
      }
    });
  }

  let firstBodyIndex = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\[V:\d+\]/.test(lines[i].trim())) {
      firstBodyIndex = i;
      break;
    }
  }

  const headerLines = stripProgramLines(lines.slice(0, firstBodyIndex));
  const bodyLines = lines.slice(firstBodyIndex);

  const updatedHeader = headerLines.map(function(line) {
    const match = line.trim().match(VOICE_META_RE);
    if (!match) return line;
    const voiceId = parseInt(match[1], 10);
    const voice = voiceById[voiceId];
    if (!voice) return line;
    return buildVoiceMetaLine(voiceId, voice);
  });

  const bodyWithPrograms = [];
  bodyLines.forEach(function(line) {
    bodyWithPrograms.push(line);
    const selectorMatch = line.trim().match(/^\[V:(\d+)\]\s*$/);
    if (!selectorMatch) return;
    const voiceId = parseInt(selectorMatch[1], 10);
    const voice = voiceById[voiceId];
    if (!voice) return;
    buildVoiceProgramPrefix(voice).forEach(function(prefixLine) {
      bodyWithPrograms.push(prefixLine);
    });
  });

  return updatedHeader.concat(bodyWithPrograms).join('\n').trim();
}

/**
 * Replace remaining generic nm="Track N" tokens anywhere in the ABC.
 */
export function replaceGenericTrackNamesInAbc(abc, profile, trackIds) {
  const voices = voiceDescriptorsFromProfile(profile, trackIds);
  let text = String(abc || '');
  voices.forEach(function(voice) {
    const replacement = safeName(displayNameForMidiTrack(voice));
    const genericPattern = new RegExp('nm="Track\\s*' + voice.id + '"', 'gi');
    text = text.replace(genericPattern, 'nm="' + replacement + '"');
  });
  voices.forEach(function(voice) {
    if (!isGenericMidiTrackName(voice.name)) return;
    const gmName = safeName(displayNameForMidiTrack(voice));
    const pattern = new RegExp('nm="' + safeName(voice.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'gi');
    text = text.replace(pattern, 'nm="' + gmName + '"');
  });
  return text;
}
