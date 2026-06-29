import { timedMelodyToAbc } from './timedMelodyModel';
import { NOISE_MODE_PRESETS } from './melodyProcessingSettings';

export function quantizeMelodyTime(value, beatTimes, strength) {
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) {
    return Number(value) || 0;
  }
  const time = Number(value) || 0;
  const clampedStrength = Math.max(0, Math.min(1, Number(strength) || 0));
  let nearest = Number(beatTimes[0]) || 0;
  let nearestDistance = Math.abs(nearest - time);
  beatTimes.forEach(function(beat) {
    const candidate = Number(beat) || 0;
    const distance = Math.abs(candidate - time);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  });
  return time * (1 - clampedStrength) + nearest * clampedStrength;
}

export function resolveMelodyNoteSettings(settings) {
  const base = Object.assign({
    noiseMode: 'balanced',
    confidenceThreshold: 0.55,
    minNoteSeconds: 0.12,
    quantizeStrength: 0.7,
  }, settings || {});
  const preset = NOISE_MODE_PRESETS[base.noiseMode] || NOISE_MODE_PRESETS.balanced;
  return Object.assign({}, base, preset);
}

export function refilterMelodyNotes(sourceNotes, settings, beatTimes) {
  const threshold = Number(settings && settings.confidenceThreshold) || 0;
  const minNoteSeconds = Number(settings && settings.minNoteSeconds) || 0;
  const quantizeStrength = Number(settings && settings.quantizeStrength) || 0;
  const notes = (Array.isArray(sourceNotes) ? sourceNotes : [])
    .map(function(note, index) {
      const start = Number(note.start) || 0;
      const end = Number(note.end) || start;
      const midi = Number(note.midi);
      if (!Number.isFinite(midi)) return null;
      return {
        id: note.id || ('note-' + index),
        start: start,
        end: end,
        midi: midi,
        name: note.name ? String(note.name) : '',
        confidence: typeof note.confidence === 'number' ? note.confidence : null,
        label: note.label ? String(note.label) : '',
      };
    })
    .filter(function(note) {
      if (!note) return false;
      const length = note.end - note.start;
      const confidence = note.confidence == null ? 1 : note.confidence;
      return length >= minNoteSeconds && confidence >= threshold;
    })
    .map(function(note) {
      if (!beatTimes || beatTimes.length === 0 || quantizeStrength <= 0) {
        return note;
      }
      return Object.assign({}, note, {
        start: quantizeMelodyTime(note.start, beatTimes, quantizeStrength),
        end: quantizeMelodyTime(note.end, beatTimes, quantizeStrength),
      });
    });

  return notes;
}

export function extractMelodySourceNotes(rawMelody, timedMelody) {
  if (rawMelody && Array.isArray(rawMelody.candidateNotes) && rawMelody.candidateNotes.length > 0) {
    return rawMelody.candidateNotes.map(function(note) {
      return Object.assign({}, note);
    });
  }
  if (rawMelody && Array.isArray(rawMelody.notes) && rawMelody.notes.length > 0) {
    return rawMelody.notes.map(function(note) {
      return Object.assign({}, note);
    });
  }
  if (timedMelody && Array.isArray(timedMelody.notes) && timedMelody.notes.length > 0) {
    return timedMelody.notes.map(function(note) {
      return Object.assign({}, note);
    });
  }
  return [];
}

export function applyMelodyNoteSettingsToDraft(draft, noteSettings, tunebook) {
  if (!draft || !draft.melodySourceNotes || draft.melodySourceNotes.length === 0) {
    return {
      melodyNoteSettings: Object.assign({}, noteSettings || {}),
    };
  }

  const beatTimes = draft.timedMelody && Array.isArray(draft.timedMelody.beatTimes)
    ? draft.timedMelody.beatTimes
    : [];
  const filteredNotes = refilterMelodyNotes(draft.melodySourceNotes, noteSettings, beatTimes);
  const timedMelody = Object.assign({}, draft.timedMelody || {}, {
    notes: filteredNotes,
    processing: Object.assign({}, noteSettings || {}),
  });
  const melodyAbcText = timedMelodyToAbc(timedMelody, {
    noteLength: draft.metadata && draft.metadata.noteLength ? draft.metadata.noteLength : '',
    beatsPerBar: timedMelody.beatsPerBar || 4,
  });
  const melodyNotesText = tunebook && tunebook.abcTools
    ? (tunebook.abcTools.justNotes(melodyAbcText) || melodyAbcText)
    : melodyAbcText;

  return {
    melodyNoteSettings: Object.assign({}, noteSettings || {}),
    timedMelody: timedMelody,
    melodyAbcText: melodyAbcText,
    melodyNotesText: melodyNotesText,
    melodyNotesEdited: false,
  };
}
