import { chordParserFactory } from 'chord-symbol';
import { noteNameToMidi } from './tunerTuningUtils';
import { extractChordSequence, tokenIsChord } from './chordSheetUtils';

const parseChord = chordParserFactory();

const ARPEGGIO_NOTE_MS = 550;
const ARPEGGIO_GAP_MS = 100;
const BLOCK_CHORD_MS = 1100;

function chordNotesToAscendingMidis(notes) {
  const midis = [];
  let lastMidi = null;
  (notes || []).slice(0, 3).forEach(function(note) {
    let midi = noteNameToMidi(note);
    if (midi == null) return;
    while (lastMidi != null && midi <= lastMidi) {
      midi += 12;
    }
    midis.push(midi);
    lastMidi = midi;
  });
  return midis;
}

export function triadPitchMidis(chordLabel) {
  const chordInfo = parseChord(String(chordLabel || '').trim());
  if (!chordInfo || chordInfo.error || !chordInfo.normalized.notes.length) return [];
  return chordNotesToAscendingMidis(chordInfo.normalized.notes);
}

export function buildArpeggioMidis(chordLabel) {
  const triad = triadPitchMidis(chordLabel);
  if (triad.length < 3) return [];
  return [triad[0], triad[1], triad[2], triad[0] + 12];
}

/**
 * Resolve which chord label to pitch: structure selection > last notation click > first in chart.
 */
export function resolveChordPitchTarget(options) {
  const opts = options || {};
  const structureSelector = opts.structureSelector || '.structure-chord-block';
  const chordChart = opts.chordChart || '';
  const lastNotationChord = String(opts.lastNotationChord || '').trim();

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const root = document.querySelector(structureSelector);
      const anchor = sel.anchorNode;
      const anchorEl = anchor && anchor.nodeType === 3 ? anchor.parentNode : anchor;
      if (root && anchorEl && root.contains(anchorEl)) {
        const text = sel.toString().trim();
        if (text && tokenIsChord(text)) return text;
      }
    }
  }

  if (lastNotationChord && tokenIsChord(lastNotationChord)) {
    return lastNotationChord;
  }

  const seq = extractChordSequence(chordChart);
  return seq.length > 0 ? seq[0] : '';
}

/**
 * Schedule 1-3-5-1 arpeggio then a block chord (root, 3rd, 5th, high root).
 * playFns: { playNote(midi, durationMs), playChord?(midis, durationMs) }
 */
export function playChordPitchCue(chordLabel, playFns, options) {
  const midis = buildArpeggioMidis(chordLabel);
  const triad = triadPitchMidis(chordLabel);
  if (!midis.length || !triad.length || !playFns || typeof playFns.playNote !== 'function') {
    return Promise.resolve(false);
  }

  const opts = options || {};
  const noteMs = opts.arpeggioNoteMs > 0 ? opts.arpeggioNoteMs : ARPEGGIO_NOTE_MS;
  const gapMs = opts.arpeggioGapMs >= 0 ? opts.arpeggioGapMs : ARPEGGIO_GAP_MS;
  const blockMs = opts.blockChordMs > 0 ? opts.blockChordMs : BLOCK_CHORD_MS;

  return new Promise(function(resolve) {
    let delay = 0;
    midis.forEach(function(midi) {
      const at = delay;
      setTimeout(function() {
        playFns.playNote(midi, noteMs);
      }, at);
      delay += noteMs + gapMs;
    });

    setTimeout(function() {
      if (typeof playFns.playChord === 'function') {
        playFns.playChord(midis, blockMs);
      } else {
        midis.forEach(function(midi) {
          playFns.playNote(midi, blockMs);
        });
      }
      setTimeout(function() { resolve(true); }, blockMs);
    }, delay);
  });
}

export const CHORD_PITCH_CUE_TIMINGS = {
  arpeggioNoteMs: ARPEGGIO_NOTE_MS,
  arpeggioGapMs: ARPEGGIO_GAP_MS,
  blockChordMs: BLOCK_CHORD_MS,
};
