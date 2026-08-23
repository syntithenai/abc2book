import {
  applyCollapseChords,
  applyRetriggerMerge,
  applySustainTrim,
} from './midiCleanupPreview';
import { slotsPerBeatFromRhythmDetail } from './midiImportWizardState';
import { rawNotesForVoice, defaultVoiceFilters } from './midiImportSession';

function beatsPerBarFromMeter(meter) {
  const parts = String(meter || '4/4').split('/');
  return parseInt(parts[0], 10) || 4;
}

function noteVelocity(note) {
  return note.velocity != null ? note.velocity : 80;
}

function noteLengthSlots(note, grid, slotsPerBeat) {
  const tempo = grid.tempoBpm || 120;
  const beatDuration = 60 / Math.max(tempo, 1);
  const slotDuration = beatDuration / Math.max(slotsPerBeat, 1);
  const len = Math.max(0, (note.end || note.start) - (note.start || 0));
  return len / slotDuration;
}

function notePositionSlots(note, grid, slotsPerBeat) {
  const tempo = grid.tempoBpm || 120;
  const meter = grid.timeSignature || '4/4';
  const beatsPerBar = beatsPerBarFromMeter(meter);
  const beatDuration = 60 / Math.max(tempo, 1);
  const barDuration = beatDuration * beatsPerBar;
  const slotDuration = beatDuration / Math.max(slotsPerBeat, 1);
  const bar = Math.floor((note.start || 0) / barDuration);
  const posInBar = (note.start || 0) - bar * barDuration;
  const pulse = Math.round(posInBar / slotDuration);
  return { bar: bar, pulse: pulse, slots: bar * beatsPerBar * slotsPerBeat + pulse };
}

function passesFilter(note, filters, grid) {
  const slotsPerBeat = (filters._slotsPerBeat != null)
    ? filters._slotsPerBeat
    : slotsPerBeatFromRhythmDetail(filters.rhythmDetail || 'standard');
  if (filters.pitchEnabled) {
    const midi = Number(note.midi) || 0;
    if (midi < filters.pitchMin || midi > filters.pitchMax) return false;
  }
  if (filters.velocityEnabled) {
    const vel = noteVelocity(note);
    if (vel < filters.velocityMin || vel > filters.velocityMax) return false;
  }
  if (filters.positionEnabled) {
    const pos = notePositionSlots(note, grid, slotsPerBeat);
    const startBar = filters.startBar || 0;
    const endBar = filters.endBar != null ? filters.endBar : 9999;
    const startPulse = filters.startPulse || 0;
    const endPulse = filters.endPulse != null ? filters.endPulse : 9999;
    if (pos.bar < startBar || pos.bar > endBar) return false;
    if (pos.bar === startBar && pos.pulse < startPulse) return false;
    if (pos.bar === endBar && pos.pulse > endPulse) return false;
  }
  if (filters.positionRepeat && filters.positionRepeat.enabled) {
    const pos = notePositionSlots(note, grid, slotsPerBeat);
    const beatsPerBar = beatsPerBarFromMeter(grid.timeSignature);
    const pulseInMeasure = pos.pulse % (beatsPerBar * slotsPerBeat);
    const low = filters.positionRepeat.lowPulse || 0;
    const high = filters.positionRepeat.highPulse != null ? filters.positionRepeat.highPulse : 9999;
    if (pulseInMeasure < low || pulseInMeasure > high) return false;
  }
  if (filters.lengthEnabled) {
    const len = noteLengthSlots(note, grid, slotsPerBeat);
    const lo = filters.lengthMinSlots || 0;
    const hi = filters.lengthMaxSlots != null ? filters.lengthMaxSlots : 9999;
    if (len < lo || len > hi) return false;
  }
  return true;
}

const SCALE_DEGREES_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const KEY_ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function keyRootMidi(key) {
  const k = String(key || 'C').replace(/m$/, '');
  const match = k.match(/^([A-G])([#b]?)/);
  if (!match) return 0;
  let root = KEY_ROOT[match[1]] || 0;
  if (match[2] === '#') root += 1;
  if (match[2] === 'b') root -= 1;
  return ((root % 12) + 12) % 12;
}

function snapPitchToKey(midi, key) {
  const root = keyRootMidi(key);
  const rel = ((Math.round(midi) % 12) - root + 12) % 12;
  let bestDegree = SCALE_DEGREES_MAJOR[0];
  let bestDist = 99;
  SCALE_DEGREES_MAJOR.forEach(function(deg) {
    const dist = Math.abs(rel - deg);
    if (dist < bestDist) {
      bestDist = dist;
      bestDegree = deg;
    }
  });
  const octave = Math.floor(midi / 12);
  return octave * 12 + root + bestDegree;
}

export function applyVoiceFilters(notes, filters, grid) {
  const passing = [];
  const excluded = [];
  (notes || []).forEach(function(note) {
    const pass = passesFilter(note, filters, grid);
    const include = filters.filterInvert ? !pass : pass;
    if (include) passing.push(Object.assign({}, note));
    else excluded.push(Object.assign({}, note));
  });
  return { passing: passing, excluded: excluded };
}

export function processVoiceNotes(session, voice, filtersOverride, gridOverride) {
  const raw = rawNotesForVoice(session, voice);
  const filters = filtersOverride || voice.filters || {};
  const grid = gridOverride || voice.grid || {};
  const filtered = applyVoiceFilters(raw, filters, grid);
  let notes = filtered.passing.slice();

  if (filters.retriggerMergeMs > 0) {
    notes = applyRetriggerMerge(notes, filters.retriggerMergeMs);
  }
  if (!filters.allowChords) {
    notes = applyCollapseChords(notes);
  }
  if (filters.legatoTrim) {
    notes = applySustainTrim(notes, grid.tempoBpm || 120);
  }
  if (filters.keySnap) {
    notes = notes.map(function(note) {
      return Object.assign({}, note, {
        midi: snapPitchToKey(note.midi, grid.estimatedKey || 'C'),
      });
    });
  }

  return {
    raw: raw,
    passing: notes,
    excluded: filtered.excluded,
    filters: filters,
    grid: grid,
  };
}

export function processSessionVoices(session) {
  const enabled = (session.voices || []).filter(function(v) { return v.enabled; });
  const sharedGrid = session.sharedGrid || {};
  const snapSlots = session.previewSnapSlotsPerBeat || 4;
  return enabled.map(function(voice) {
    const filters = Object.assign({}, voice.filters || defaultVoiceFilters(), { _slotsPerBeat: snapSlots });
    const grid = Object.assign({}, sharedGrid, voice.grid || {}, {
      estimatedKey: (voice.grid && voice.grid.estimatedKey) || sharedGrid.estimatedKey || 'C',
      tempoBpm: sharedGrid.tempoBpm || (voice.grid && voice.grid.tempoBpm) || 120,
      timeSignature: sharedGrid.timeSignature || (voice.grid && voice.grid.timeSignature) || '4/4',
    });
    const result = processVoiceNotes(session, voice, filters, grid);
    const cleanFilters = Object.assign({}, filters);
    delete cleanFilters._slotsPerBeat;
    return Object.assign({}, voice, {
      rawNotes: result.raw,
      notes: result.passing,
      excludedNotes: result.excluded,
      filters: cleanFilters,
      grid: grid,
    });
  });
}
