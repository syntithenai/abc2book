import { estimateTempoFromNotes } from './midiImportWizardState';

const KEY_PROFILES = {
  C: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  G: [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 6.35],
  D: [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 6.35, 2.29, 2.88],
  A: [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 6.35, 2.39, 3.66, 2.29, 2.88],
  E: [2.88, 2.23, 3.48, 2.33, 4.38, 6.35, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  B: [2.88, 2.23, 3.48, 2.33, 6.35, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  'F#': [2.88, 2.23, 3.48, 6.35, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  F: [2.88, 2.23, 6.35, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  Bb: [2.88, 6.35, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  Eb: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  Ab: [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 6.35, 5.19, 2.39, 3.66, 2.29, 2.88],
  Db: [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 6.35, 3.66, 2.29, 2.88],
};

function pitchClassHistogram(notes) {
  const hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  (notes || []).forEach(function(note) {
    const midi = Number(note.midi) || 0;
    if (midi <= 0) return;
    hist[midi % 12] += 1;
  });
  const total = hist.reduce(function(sum, v) { return sum + v; }, 0) || 1;
  return hist.map(function(v) { return v / total; });
}

export function estimateKeyFromNotes(notes) {
  const hist = pitchClassHistogram(notes);
  let bestKey = 'C';
  let bestCorr = -2;
  Object.keys(KEY_PROFILES).forEach(function(key) {
    const profile = KEY_PROFILES[key];
    let corr = 0;
    for (let i = 0; i < 12; i += 1) corr += hist[i] * profile[i];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestKey = key;
    }
  });
  return bestKey;
}

export function detectAnacrusis(notes, tempoBpm, timeSignature) {
  const list = (notes || []).slice().sort(function(a, b) { return a.start - b.start; });
  if (!list.length) return { hasAnacrusis: false, label: 'No anacrusis' };
  const first = list[0].start || 0;
  if (first <= 0.02) return { hasAnacrusis: false, label: 'No anacrusis' };
  const parts = String(timeSignature || '4/4').split('/');
  const beatsPerBar = parseInt(parts[0], 10) || 4;
  const beatDuration = 60 / Math.max(tempoBpm || 120, 1);
  const barDuration = beatDuration * beatsPerBar;
  if (first >= barDuration) return { hasAnacrusis: false, label: 'No anacrusis' };
  const beats = first / beatDuration;
  if (beats > 0 && beats < beatsPerBar - 0.05) {
    return {
      hasAnacrusis: true,
      label: 'Anacrusis (~' + (Math.round(beats * 10) / 10) + ' beats)',
      pickupBeats: beats,
    };
  }
  return { hasAnacrusis: false, label: 'No anacrusis' };
}

export function detectVoiceMetrics(notes, options) {
  const opts = options || {};
  const tempoBpm = opts.tempoBpm || 120;
  const timeSignature = opts.timeSignature || '4/4';
  const tempo = estimateTempoFromNotes([notes]) || tempoBpm;
  const key = estimateKeyFromNotes(notes);
  const anacrusis = detectAnacrusis(notes, tempo, timeSignature);
  return {
    tempoBpm: tempo,
    timeSignature: timeSignature,
    estimatedKey: key,
    anacrusis: anacrusis,
  };
}
