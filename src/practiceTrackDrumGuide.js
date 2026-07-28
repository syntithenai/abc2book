/**
 * Drum guide configuration for beat-locked MIDI percussion (server renders to WAV).
 */

import {
  defaultDrumPresetIdForRhythm,
  getRhythmPresetById,
} from './drumPatternPresets';
import { resolveDrumPresetIdForStyle } from './practiceTrackStylePresets';

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
    return {};
  }
  const hits = {};
  pattern.tracks.forEach(function(track) {
    if (!track || !track.id || !Array.isArray(track.steps)) return;
    const indices = [];
    track.steps.forEach(function(step, index) {
      if (step) indices.push(index);
    });
    hits[track.id] = indices;
  });
  return hits;
}

/**
 * Build drum guide config embedded in the practice-track timing payload.
 * @param {object} plan - TimingSongPlan
 * @param {object} [options]
 * @param {string} [options.styleId]
 * @param {string} [options.presetId]
 */
export function buildDrumGuideConfig(plan, options) {
  const opts = options || {};
  const timing = plan && plan.timing ? plan.timing : {};
  const musical = plan && plan.musical ? plan.musical : {};
  const presetId = opts.presetId
    || (opts.styleId ? resolveDrumPresetIdForStyle(opts.styleId, plan) : null)
    || defaultDrumPresetIdForRhythm(musical.rhythm);
  const preset = getRhythmPresetById(presetId);
  if (!preset || !preset.drumPattern) {
    return null;
  }

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
    tracks: trackHitsFromPreset(preset),
    gmPitches: Object.assign({}, DRUM_GUIDE_GM_PITCHES),
  };
}
