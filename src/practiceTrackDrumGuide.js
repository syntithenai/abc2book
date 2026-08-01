/**
 * Drum guide configuration for beat-locked MIDI percussion (server renders to WAV).
 */

import {
  defaultDrumPresetIdForRhythm,
  getRhythmPresetById,
} from './drumPatternPresets';
import { resolveDrumPresetIdForStyle } from './practiceTrackStylePresets';
import {
  getDrumStepSample,
  getDrumStepVelocity,
  normalizeDrumPattern,
} from './rhythmEngineTypes';

/** General MIDI drum pitches used by practice-track drum guide. */
export const DRUM_GUIDE_GM_PITCHES = {
  kick: 36,
  snare: 38,
  hat: 42,
  rim: 37,
  tom: 45,
};

function trackHitsFromPreset(preset) {
  const pattern = preset && preset.drumPattern;
  if (!pattern || !Array.isArray(pattern.tracks)) {
    return { hits: {}, velocities: {} };
  }
  const hits = {};
  const velocities = {};
  pattern.tracks.forEach(function(track) {
    if (!track || !track.id || !Array.isArray(track.steps)) return;
    const indices = [];
    const vel = [];
    track.steps.forEach(function(step, index) {
      if (step) {
        indices.push(index);
        vel.push(Math.round(getDrumStepVelocity(track, index) * 127));
      }
    });
    hits[track.id] = indices;
    velocities[track.id] = vel;
  });
  return { hits: hits, velocities: velocities };
}

function trackHitsFromCustomPattern(drumPattern) {
  const pattern = normalizeDrumPattern(drumPattern);
  const hits = {};
  const velocities = {};
  const samples = {};
  (pattern.tracks || []).forEach(function(track) {
    if (!track || !track.id || !Array.isArray(track.steps)) return;
    const indices = [];
    const vel = [];
    const sampleIds = [];
    track.steps.forEach(function(step, index) {
      if (step) {
        indices.push(index);
        vel.push(Math.round(getDrumStepVelocity(track, index) * 127));
        const sample = getDrumStepSample(track, index);
        sampleIds.push(sample || track.sample);
      }
    });
    hits[track.id] = indices;
    velocities[track.id] = vel;
    samples[track.id] = sampleIds;
  });
  return { hits: hits, velocities: velocities, samples: samples };
}

/**
 * Resolve drum guide build options from tune playback metronome settings.
 */
export function drumGuideOptionsFromTune(tune, plan, baseOptions) {
  const opts = baseOptions || {};
  if (!tune) return opts;
  const engine = tune.playbackMetronomeEngine;
  const drumRhythm = tune.playbackMetronomeDrumRhythm;
  if (engine === 'drums' && drumRhythm && drumRhythm.drumPattern) {
    const presetId = drumRhythm.presetId
    if (!presetId || (typeof presetId === 'string' && presetId.indexOf('user-') === 0)) {
      return Object.assign({}, opts, {
        customPattern: drumRhythm.drumPattern,
        rhythm: drumRhythm,
      });
    }
  }
  return opts;
}

/**
 * Build drum guide config embedded in the practice-track timing payload.
 * @param {object} plan - TimingSongPlan
 * @param {object} [options]
 * @param {string} [options.styleId]
 * @param {string} [options.presetId]
 * @param {object} [options.customPattern] - user drum pattern from metronome editor
 * @param {object} [options.rhythm] - tune rhythm for meter matching
 */
export function buildDrumGuideConfig(plan, options) {
  const opts = options || {};
  const timing = plan && plan.timing ? plan.timing : {};
  const musical = plan && plan.musical ? plan.musical : {};

  if (opts.customPattern) {
    const pattern = normalizeDrumPattern(opts.customPattern);
    const trackData = trackHitsFromCustomPattern(pattern);
    const rhythm = opts.rhythm || musical.rhythm || { beatsPerBar: 4, pulsesPerBeat: [4, 4, 4, 4] };
    return {
      customPattern: true,
      tempoBpm: parseFloat(timing.tempoBpm || musical.tempoBpm) || 120,
      meter: String(musical.meter || timing.meter || '4/4'),
      beatsPerBar: rhythm.beatsPerBar || 4,
      pulsesPerBeat: rhythm.pulsesPerBeat || [4, 4, 4, 4],
      swing: pattern.swing || 0,
      barBoundariesSec: Array.isArray(timing.barBoundariesSec)
        ? timing.barBoundariesSec.slice()
        : [],
      totalDurationSec: parseFloat(timing.totalDurationSec) || 0,
      tracks: trackData.hits,
      trackVelocities: trackData.velocities,
      trackSamples: trackData.samples,
      gmPitches: Object.assign({}, DRUM_GUIDE_GM_PITCHES),
    };
  }

  const presetId = opts.presetId
    || (opts.styleId ? resolveDrumPresetIdForStyle(opts.styleId, plan) : null)
    || defaultDrumPresetIdForRhythm(musical.rhythm);
  const preset = getRhythmPresetById(presetId);
  if (!preset || !preset.drumPattern) {
    return null;
  }

  const trackData = trackHitsFromPreset(preset);

  return {
    presetId: presetId,
    tempoBpm: parseFloat(timing.tempoBpm || musical.tempoBpm) || 120,
    meter: String(musical.meter || timing.meter || '4/4'),
    beatsPerBar: preset.beatsPerBar,
    pulsesPerBeat: preset.pulsesPerBeat,
    swing: preset.swing || 0,
    barBoundariesSec: Array.isArray(timing.barBoundariesSec)
      ? timing.barBoundariesSec.slice()
      : [],
    totalDurationSec: parseFloat(timing.totalDurationSec) || 0,
    tracks: trackData.hits,
    trackVelocities: trackData.velocities,
    gmPitches: Object.assign({}, DRUM_GUIDE_GM_PITCHES),
  };
}
