import { buildChordFillAbc, beatsPerBarFromMeter } from './chordFillPattern';
import { splitChordChartIntoBlocks, chartBlockHasChords } from './chordSheetUtils';
import { getMelodyChordChart } from './practiceTrackChordUtils';
import { renderAbcToAudioBuffer } from './notationAudioExport';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';

function stripBarDecorations(bar) {
  return String(bar || '')
    .replace(/\|:?|:?\|/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
}

function primaryChordFromBar(barText) {
  const tokens = stripBarDecorations(barText).split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token !== '.' && !/^\d+$/.test(token)) {
      return token;
    }
  }
  return '';
}

export function parseChordChartBars(chordChart) {
  if (!chordChart) return [];
  const blocks = splitChordChartIntoBlocks(chordChart);
  const bars = [];
  blocks.forEach(function(block) {
    if (!chartBlockHasChords(block)) return;
    String(block || '').split('|').forEach(function(bar) {
      const trimmed = stripBarDecorations(bar);
      if (!trimmed) return;
      bars.push(primaryChordFromBar(trimmed));
    });
  });
  return bars;
}

export function extractChordsPerBar(tune, tunebook, abcjsParser) {
  const chart = getMelodyChordChart(tune, tunebook, abcjsParser);
  return parseChordChartBars(chart);
}

export function buildChordLayerAbc(tune, chordsPerBar) {
  if (!tune || !Array.isArray(chordsPerBar) || !chordsPerBar.length) return '';
  const meter = tune.meter || '4/4';
  const beats = beatsPerBarFromMeter(meter);
  const tempo = parseFloat(tune.tempo) || 120;
  const key = tune.key || 'C';
  const noteLength = tune.noteLength || '1/4';
  const barLines = chordsPerBar.map(function(chord) {
    if (!chord) return 'z' + beats + ' |';
    const fillAbc = buildChordFillAbc(chord, {
      meter: meter,
      tempo: tempo,
      key: key,
      beatsPerBar: beats,
    });
    if (!fillAbc) return 'z' + beats + ' |';
    const lines = fillAbc.split('\n');
    return lines[lines.length - 1];
  });
  return [
    'X:1',
    'T:Chord layer',
    'M:' + meter,
    'L:' + noteLength,
    'Q:1/4=' + tempo,
    'K:' + key,
    barLines.join('\n'),
  ].join('\n');
}

export async function renderChordLayerWav(tune, chordsPerBar) {
  const abc = buildChordLayerAbc(tune, chordsPerBar);
  if (!abc) return null;
  const buffer = await renderAbcToAudioBuffer(abc, { chordsOff: false, tune: tune });
  return encodeAudioBufferToWav(buffer);
}

export function attachChordsToStrains(strains, chordsPerBar) {
  if (!Array.isArray(strains) || !Array.isArray(chordsPerBar)) return strains;
  return strains.map(function(strain) {
    const start = Math.max(0, parseInt(strain.startBar, 10) || 0);
    const end = Math.max(start, parseInt(strain.endBar, 10) || start);
    const chords = [];
    for (let bar = start; bar <= end; bar += 1) {
      if (chordsPerBar[bar]) chords.push(chordsPerBar[bar]);
    }
    return Object.assign({}, strain, { chords: chords });
  });
}
