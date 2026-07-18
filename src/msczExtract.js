/**
 * MuseScore .mscz → MusicXML (.mscx) → ABC candidates via existing score pipeline.
 */
import { unzipArchive, findArchiveEntry, fileExtension } from './importArchiveParser';
import { isMusicXmlText } from './mxlExtract';
import { importMusicXmlText } from './scoreImportClient';
import { abcTextToCandidates } from './importSourceParse';

export function isMsczFile(file) {
  if (!file) return false;
  return String(file.name || '').toLowerCase().endsWith('.mscz');
}

function isMscxName(name) {
  const lower = String(name || '').toLowerCase();
  if (!lower || lower.endsWith('/')) return false;
  if (lower.indexOf('__macosx/') >= 0) return false;
  return lower.endsWith('.mscx');
}

/**
 * Extract MusicXML text from a .mscz ArrayBuffer/Blob/File.
 */
export async function extractMusicXmlFromMscz(input) {
  const { entries, names } = await unzipArchive(input);
  const mscxNames = names.filter(isMscxName);
  if (!mscxNames.length) {
    // Some older packages may store score as .xml
    const xmlNames = names.filter(function(n) {
      const lower = String(n || '').toLowerCase();
      return lower.endsWith('.xml') && lower.indexOf('__macosx/') < 0 && !lower.endsWith('/');
    });
    if (!xmlNames.length) {
      throw new Error('Could not find a MuseScore score (.mscx) inside that .mscz file');
    }
    const entry = findArchiveEntry(entries, xmlNames[0]);
    const text = await entry.text();
    if (!isMusicXmlText(text)) {
      throw new Error('MuseScore archive does not contain valid MusicXML');
    }
    return { musicXml: text, scoreName: xmlNames[0] };
  }
  // Prefer a root-level or shortest path .mscx
  mscxNames.sort(function(a, b) {
    return a.split('/').length - b.split('/').length || a.length - b.length;
  });
  const entry = findArchiveEntry(entries, mscxNames[0]);
  const musicXml = await entry.text();
  if (!isMusicXmlText(musicXml)) {
    throw new Error('MuseScore archive does not contain valid MusicXML');
  }
  return { musicXml: musicXml, scoreName: mscxNames[0], allScores: mscxNames };
}

export async function msczFileToCandidates(file, options) {
  const opts = options || {};
  const extracted = await extractMusicXmlFromMscz(file);
  const scoreNames = extracted.allScores && extracted.allScores.length > 1
    ? extracted.allScores
    : [extracted.scoreName];

  if (scoreNames.length === 1) {
    const result = importMusicXmlText(extracted.musicXml, file.name || 'score.mscz');
    return abcTextToCandidates(result.abc, opts.tunebook, opts.book).map(function(c) {
      return Object.assign({}, c, {
        sourceKind: 'mscz',
        skipEnrich: true,
        attachmentPolicy: 'mergeNotation',
      });
    });
  }

  // Multi-score .mscz: extract each
  const { entries } = await unzipArchive(file);
  const candidates = [];
  for (let i = 0; i < scoreNames.length; i += 1) {
    const entry = findArchiveEntry(entries, scoreNames[i]);
    if (!entry) continue;
    const xml = await entry.text();
    if (!isMusicXmlText(xml)) continue;
    const result = importMusicXmlText(xml, scoreNames[i]);
    abcTextToCandidates(result.abc, opts.tunebook, opts.book).forEach(function(c) {
      candidates.push(Object.assign({}, c, {
        sourceKind: 'mscz',
        skipEnrich: true,
        attachmentPolicy: 'mergeNotation',
        bundleSource: file.name,
      }));
    });
  }
  if (!candidates.length) {
    throw new Error('Could not convert MuseScore file to ABC');
  }
  return candidates;
}

export { fileExtension };
