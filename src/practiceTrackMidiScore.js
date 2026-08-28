import abcjs from 'abcjs';
import { normalizeMidiBinaryData } from './midiFileUtils';
import {
  parseMidiProgramFromNotes,
  setMidiProgramInNotes,
  instrumentNameToMidiProgram,
  parseVoiceMeta,
} from './notation/voiceMeta';

/**
 * Ensure each voice body carries %%MIDI program from tune metadata.
 */
export function injectVoiceMidiPrograms(tune) {
  if (!tune || !tune.voices) return tune;
  const copy = JSON.parse(JSON.stringify(tune));
  Object.keys(copy.voices).forEach(function(voiceKey) {
    const voice = copy.voices[voiceKey];
    if (!voice) return;
    const meta = parseVoiceMeta(voice.meta || '');
    const program = parseMidiProgramFromNotes(voice.notes);
    const namedProgram = meta.name
      ? instrumentNameToMidiProgram(meta.name.replace(/\s+/g, '_').toLowerCase())
      : program;
    const resolved = parseMidiProgramFromNotes(voice.notes) || namedProgram || 0;
    voice.notes = setMidiProgramInNotes(voice.notes, resolved);
  });
  return copy;
}

export function buildPracticeTrackExportAbc(tune, tunebook) {
  if (!tune) return '';
  const enriched = injectVoiceMidiPrograms(tune);
  if (tunebook && typeof tunebook.getExportAbc === 'function') {
    return tunebook.getExportAbc(enriched) || '';
  }
  if (tunebook && tunebook.abcTools && typeof tunebook.abcTools.json2abc === 'function') {
    return tunebook.abcTools.json2abc(enriched) || '';
  }
  return '';
}

/**
 * Canonical Type-1 MIDI score from notation (melody + chord accompaniment).
 * @param {object} tune
 * @param {object} tunebook
 * @param {object} [plan] - TimingSongPlan for metadata attachment
 * @param {object} [opts]
 * @param {boolean} [opts.melodyOnlyForGuide=true] - Omit abcjs chord track (harmony from chord chart)
 */
export function buildPracticeTrackMidiScore(tune, tunebook, plan, opts = {}) {
  const abc = buildPracticeTrackExportAbc(tune, tunebook);
  if (!abc || !String(abc).trim()) {
    throw new Error('No notation available for MIDI score');
  }
  if (!abcjs.synth || typeof abcjs.synth.getMidiFile !== 'function') {
    throw new Error('abcjs MIDI export is unavailable');
  }

  const timing = plan && plan.timing ? plan.timing : {};
  const tempo = Math.round(parseFloat(timing.tempoBpm || (tune && tune.tempo)) || 120);
  const useMelodyOnlyScore = opts.melodyOnlyForGuide !== false;
  const midi = abcjs.synth.getMidiFile(abc, {
    chordsOff: useMelodyOnlyScore,
    midiOutputType: 'binary',
    bpm: tempo,
  });
  const midiBytes = normalizeMidiBinaryData(midi);
  if (!midiBytes) {
    throw new Error('Could not build MIDI score from notation');
  }

  const strains = (plan && Array.isArray(plan.structure) ? plan.structure : []).map(function(section) {
    return {
      strainLabel: section.strainLabel,
      startBar: section.startBar,
      endBar: section.endBar,
      startTimeSec: section.startTimeSec,
      endTimeSec: section.endTimeSec,
    };
  });

  return {
    midiBytes: midiBytes,
    abc: abc,
    meta: {
      tempoBpm: tempo,
      totalDurationSec: parseFloat(timing.totalDurationSec) || 0,
      barBoundariesSec: Array.isArray(timing.barBoundariesSec)
        ? timing.barBoundariesSec.slice()
        : [],
      strains: strains,
      source: 'notation-midi',
      melodyOnlyForGuide: useMelodyOnlyScore,
    },
  };
}

export function midiScoreToBlob(midiBytes) {
  return new Blob([midiBytes], { type: 'audio/midi' });
}

export function downloadMidiScore(midiBytes, filename) {
  if (typeof document === 'undefined' || !midiBytes) return;
  const name = String(filename || 'score.mid');
  const url = window.URL.createObjectURL(midiScoreToBlob(midiBytes));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.endsWith('.mid') ? name : name + '.mid';
  anchor.click();
  window.URL.revokeObjectURL(url);
}
