import vertaal from './xml2abc';
import { checkForMissingXmlHeader, isMusicXmlText } from './mxlExtract';
import { formatVoiceMeta, parseVoiceMeta } from './notation/voiceMeta';

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
  b: 8,
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

const VOICE_HEADER_RE = /^V:(\S+)\s*(.*)$/;
const INLINE_VOICE_RE = /\[V:([^\s\]]+)/g;
const INLINE_KEY_CLEF_RE = /\[K:(treble|alto1|alto2|alto|tenor|bass3|bass)\]/gi;

function rewriteXml2AbcVoiceHeaders(abcText) {
  return String(abcText || '').split('\n').map(function(line) {
    const match = line.match(VOICE_HEADER_RE);
    if (!match) return line;
    const rest = String(match[2] || '').trim();
    if (!rest) return line;
    const formatted = formatVoiceMeta(parseVoiceMeta(rest));
    return 'V:' + match[1] + (formatted ? ' ' + formatted : '');
  }).join('\n');
}

function headerClefByVoice(abcText) {
  const clefs = {};
  String(abcText || '').split('\n').forEach(function(line) {
    const match = line.match(VOICE_HEADER_RE);
    if (!match) return;
    if (!String(match[2] || '').trim()) return;
    if (clefs[match[1]]) return;
    clefs[match[1]] = String(parseVoiceMeta(match[2] || '').clef || '').toLowerCase();
  });
  return clefs;
}

function stripRedundantInlineClefs(abcText) {
  const headerClefs = headerClefByVoice(abcText);
  let currentVoice = Object.keys(headerClefs)[0] || '1';
  return String(abcText || '').split('\n').map(function(line) {
    const header = line.match(VOICE_HEADER_RE);
    if (header) currentVoice = header[1];
    INLINE_VOICE_RE.lastIndex = 0;
    let voiceMatch;
    while ((voiceMatch = INLINE_VOICE_RE.exec(line))) {
      currentVoice = voiceMatch[1];
    }
    const headerClef = String(headerClefs[currentVoice] || '').toLowerCase();
    if (!headerClef) return line;
    INLINE_KEY_CLEF_RE.lastIndex = 0;
    return line.replace(INLINE_KEY_CLEF_RE, function(marker, clefName) {
      if (String(clefName || '').toLowerCase() === headerClef) return '';
      return marker;
    });
  }).join('\n');
}

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
  let abc = rewriteXml2AbcVoiceHeaders(abcText || '');
  abc = stripRedundantInlineClefs(abc);

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
