import { unzip } from 'unzipit';

const CONTAINER_PATH = 'META-INF/container.xml';
const LEGACY_SCORE_PATH = 'score.xml';

function parseContainerRootPath(containerXml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(containerXml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid MXL container metadata');
  }
  const rootfile = doc.getElementsByTagName('rootfile')[0];
  if (!rootfile) {
    throw new Error('MXL archive has no rootfile entry');
  }
  const fullPath = rootfile.getAttribute('full-path');
  if (!fullPath) {
    throw new Error('MXL rootfile is missing full-path');
  }
  return fullPath;
}

function findEntry(entries, path) {
  if (entries[path]) {
    return entries[path];
  }
  const normalized = path.replace(/^\.\//, '');
  if (entries[normalized]) {
    return entries[normalized];
  }
  const lower = normalized.toLowerCase();
  const match = Object.keys(entries).find(function(key) {
    return key.toLowerCase() === lower;
  });
  return match ? entries[match] : null;
}

/**
 * Extract MusicXML text from a compressed .mxl ArrayBuffer.
 */
export async function extractMusicXmlFromMxl(arrayBuffer) {
  const { entries } = await unzip(arrayBuffer);
  let rootPath = null;

  const containerEntry = findEntry(entries, CONTAINER_PATH);
  if (containerEntry) {
    const containerXml = await containerEntry.text();
    rootPath = parseContainerRootPath(containerXml);
  } else {
    rootPath = LEGACY_SCORE_PATH;
  }

  const scoreEntry = findEntry(entries, rootPath);
  if (!scoreEntry) {
    throw new Error('Could not find MusicXML file "' + rootPath + '" inside MXL archive');
  }

  const musicXml = await scoreEntry.text();
  if (!isMusicXmlText(musicXml)) {
    throw new Error('MXL archive does not contain valid MusicXML');
  }
  return musicXml;
}

export function isMusicXmlText(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const head = text.slice(0, 200).toLowerCase();
  return head.indexOf('<?xml') !== -1
    || head.indexOf('<score-partwise') !== -1
    || head.indexOf('<score-timewise') !== -1;
}

export function checkForMissingXmlHeader(input) {
  const re = /^<score-partwise\s+version="([^"]+)">/;
  const match = input.match(re);
  if (!match) {
    return input;
  }
  const version = match[1];
  const header =
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML '
    + version + ' Partwise//EN" '
    + '"http://www.musicxml.org/dtds/partwise.dtd">\n';
  return header + input;
}
