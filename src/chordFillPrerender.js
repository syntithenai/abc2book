import abcjs from 'abcjs';
import { buildChordFillAbc, chordFillCacheKey } from './chordFillPattern';
import { getSoundFontUrl, getSoundFontVolumeMultiplier } from './soundFontConfig';

async function primeSingleFill(abc, audioContext) {
  const visualObjs = abcjs.renderAbc('*', abc);
  const visualObj = visualObjs && visualObjs[0];
  if (!visualObj) return null;

  const synth = new abcjs.synth.CreateSynth();
  await synth.init({
    audioContext: audioContext,
    visualObj: visualObj,
    millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
    options: {
      soundFontUrl: getSoundFontUrl(),
      soundFontVolumeMultiplier: getSoundFontVolumeMultiplier(),
      chordsOff: false,
    },
  });
  await synth.prime();
  const buffer = synth.audioBuffers && synth.audioBuffers[0] ? synth.audioBuffers[0] : null;
  try {
    synth.stop();
  } catch (err) { /* ignore */ }
  return buffer;
}

export async function primeChordFills(chordLabels, options) {
  const opts = options || {};
  const labels = Array.from(new Set((chordLabels || [])
    .map(function(label) { return String(label || '').trim(); })
    .filter(Boolean)));
  const audioContext = opts.audioContext || new (window.AudioContext || window.webkitAudioContext)();
  const buffers = new Map();
  const errors = [];

  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    const cacheKey = chordFillCacheKey(label, opts);
    const abc = buildChordFillAbc(label, opts);
    if (!abc) {
      errors.push({ label: label, error: 'Could not build fill ABC' });
      continue;
    }
    try {
      const buffer = await primeSingleFill(abc, audioContext);
      if (buffer) {
        buffers.set(label, buffer);
        buffers.set(cacheKey, buffer);
      } else {
        errors.push({ label: label, error: 'Prime returned no audio buffer' });
      }
    } catch (err) {
      errors.push({ label: label, error: err && err.message ? err.message : String(err) });
    }
  }

  return { buffers: buffers, audioContext: audioContext, errors: errors };
}

export function getFillBuffer(buffers, chordLabel, options) {
  if (!buffers) return null;
  const label = String(chordLabel || '').trim();
  if (buffers.get(label)) return buffers.get(label);
  const cacheKey = chordFillCacheKey(label, options || {});
  return buffers.get(cacheKey) || null;
}
