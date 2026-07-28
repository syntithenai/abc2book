import { splitChordChartIntoBlocks } from './chordSheetUtils';

function getFirstVoiceNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const keys = Object.keys(tune.voices);
  if (!keys.length) return [];
  const voice = tune.voices[keys[0]];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

export function getMelodyChordChart(tune, tunebook, abcjsParser) {
  if (!tune || !abcjsParser) return '';
  try {
    const noteLines = getFirstVoiceNoteLines(tune);
    const melodyAbc = tunebook && tunebook.abcTools
      ? tunebook.abcTools.emptyABC(tune.name) + noteLines.join('\n')
      : noteLines.join('\n');
    if (!melodyAbc) return '';
    const transpose = Number(tune.transpose) || 0;
    return abcjsParser.renderChords(
      melodyAbc,
      false,
      transpose,
      tune.key,
      tune.noteLength,
      tune.meter
    ) || '';
  } catch (err) {
    return '';
  }
}

export function tuneHasChordChart(tune, tunebook, abcjsParser) {
  const blocks = splitChordChartIntoBlocks(getMelodyChordChart(tune, tunebook, abcjsParser));
  return blocks.length > 0;
}
