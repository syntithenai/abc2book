import vertaal from './xml2abc';
import { checkForMissingXmlHeader, isMusicXmlText } from './mxlExtract';

export const DEFAULT_XML2ABC_OPTIONS = {
  u: 0,
  b: 4,
  n: 0,
  c: 0,
  v: 0,
  d: 0,
  m: 1,
  x: 0,
  t: 0,
  v1: 0,
  noped: 0,
  stm: 0,
  p: 'f',
  s: 0,
  addstavenum: 1,
  rehparts: 0,
  addq: 0,
  q: 100,
  mnum: -1,
};

/** xml2abc defaults tuned for MIDI → MusicXML imports. */
export const MIDI_XML2ABC_OPTIONS = {
  u: 0,
  b: 4,
  n: 0,
  c: 0,
  v: 0,
  d: 8,
  m: 1,
  x: 0,
  t: 0,
  v1: 0,
  noped: 0,
  stm: 0,
  p: 'f',
  s: 0,
  addstavenum: 0,
  rehparts: 0,
  addq: 1,
  q: 100,
  mnum: -1,
};

const REDUNDANT_CLEF_MARKERS = [
  '[K:treble]',
  '[K:alto]',
  '[K:alto1]',
  '[K:alto2]',
  '[K:tenor]',
  '[K:bass]',
  '[K:bass3]',
];

function titleFromFileName(fileName) {
  if (!fileName) {
    return 'Untitled';
  }
  let name = fileName.replace(/\.[^.]+$/i, '');
  name = name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) {
    return 'Untitled';
  }
  return name.replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
}

function parseXmlDocument(musicXmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(musicXmlText, 'text/xml');
  const parseError = xml.querySelector('parsererror');
  if (parseError) {
    throw new Error('MusicXML parse error');
  }
  return xml;
}

function applyPostConversionCleanup(abcText, fileName, options) {
  let abc = abcText || '';
  REDUNDANT_CLEF_MARKERS.forEach(function(marker) {
    abc = abc.split(marker).join('');
  });

  if (options.addq === 1 && abc.indexOf('\nQ:') === -1 && abc.indexOf('Q:') !== 0) {
    const tempo = options.q || 100;
    abc = abc.replace(/^X:/m, 'Q:1/4=' + tempo + '\nX:');
  }

  if (abc.indexOf('T:Title') !== -1) {
    abc = abc.replace('T:Title', 'T:' + titleFromFileName(fileName));
  }

  abc = abc.replace(/Music21 Fragment/g, titleFromFileName(fileName));
  abc = abc.replace(/Music21/g, '');

  return abc.trim();
}

/**
 * Convert MusicXML text to ABC notation.
 */
export function musicXmlToAbc(musicXmlText, options = {}) {
  if (!musicXmlText || !musicXmlText.trim()) {
    throw new Error('MusicXML input is empty');
  }

  let normalized = checkForMissingXmlHeader(musicXmlText.trim());
  if (!isMusicXmlText(normalized)) {
    throw new Error('Input is not valid MusicXML');
  }

  const mergedOptions = Object.assign({}, DEFAULT_XML2ABC_OPTIONS, options);
  const xmlDoc = parseXmlDocument(normalized);

  let replacedStaveNum = false;
  if (mergedOptions.x === 0 && mergedOptions.addstavenum === 1) {
    replacedStaveNum = true;
    mergedOptions.addstavenum = 0;
  }

  const result = vertaal(xmlDoc, mergedOptions);
  if (replacedStaveNum) {
    mergedOptions.addstavenum = 1;
  }

  const abcText = result && result[0] ? result[0] : '';
  if (!abcText.trim()) {
    throw new Error('MusicXML conversion produced no ABC output');
  }

  return applyPostConversionCleanup(abcText, options.fileName || '', mergedOptions);
}
