/**
 * Shared archive (ZIP) intake: unzipit dispatch by outer extension / member type.
 */
import { unzip } from 'unzipit';

export function fileExtension(fileName) {
  const name = String(fileName || '').toLowerCase();
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
}

export function isZipLikeFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (type === 'application/zip' || type === 'application/x-zip-compressed') return true;
  return ['.zip', '.sbp', '.sbpbackup', '.mscz', '.mxl', '.onsongarchive', '.backup'].some(function(ext) {
    return name.endsWith(ext);
  });
}

export function isChordSheetZipArchive(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed') {
    return true;
  }
  return false;
}

const CHORD_MEMBER_EXTS = ['.cho', '.pro', '.crd', '.onsong', '.txt'];

export function isChordSheetMemberName(name) {
  const lower = String(name || '').toLowerCase();
  // Skip nested macOS junk / directories
  if (!lower || lower.endsWith('/')) return false;
  if (lower.indexOf('__macosx/') >= 0) return false;
  return CHORD_MEMBER_EXTS.some(function(ext) { return lower.endsWith(ext); });
}

/**
 * Unzip an ArrayBuffer or Blob; return { entries, names }.
 * entries[name] has .text() / .arrayBuffer() like unzipit.
 */
export async function unzipArchive(input) {
  let arrayBuffer = input;
  if (input && typeof input.arrayBuffer === 'function') {
    arrayBuffer = await input.arrayBuffer();
  }
  const { entries } = await unzip(arrayBuffer);
  return {
    entries: entries,
    names: Object.keys(entries || {}),
  };
}

export function findArchiveEntry(entries, path) {
  if (!entries) return null;
  if (entries[path]) return entries[path];
  const normalized = String(path || '').replace(/^\.\//, '');
  if (entries[normalized]) return entries[normalized];
  const lower = normalized.toLowerCase();
  const match = Object.keys(entries).find(function(key) {
    return key.toLowerCase() === lower;
  });
  return match ? entries[match] : null;
}

/**
 * Expand a ZIP of ChordPro/OnSong text files into parse candidates.
 */
export async function chordSheetZipToCandidates(file, options) {
  const opts = options || {};
  const { parseImportText } = await import('./importSourceParse');
  const { entries, names } = await unzipArchive(file);
  const members = names.filter(isChordSheetMemberName);
  if (!members.length) {
    throw new Error('No ChordPro or OnSong files found in that ZIP.');
  }
  const candidates = [];
  for (let i = 0; i < members.length; i += 1) {
    const name = members[i];
    const entry = entries[name];
    if (!entry) continue;
    const text = await entry.text();
    const parsed = parseImportText({
      text: text,
      fileName: name.split('/').pop() || name,
      tunebook: opts.tunebook,
      abcjsParser: opts.abcjsParser,
      book: opts.book,
    });
    (parsed || []).forEach(function(c) {
      candidates.push(Object.assign({}, c, {
        sourceKind: c.sourceKind || 'chordsheet',
        bundleSource: file.name || 'archive.zip',
        skipEnrich: true,
      }));
    });
  }
  if (!candidates.length) {
    throw new Error('Could not parse any songs from that ZIP.');
  }
  return candidates;
}

/**
 * Detect archive kind from filename for dispatch.
 */
export function detectArchiveKind(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.mscz')) return 'mscz';
  if (lower.endsWith('.sbp') || lower.endsWith('.sbpbackup')) return 'sbp';
  if (lower.endsWith('.onsongarchive')) return 'onsongarchive';
  if (lower.endsWith('.backup') && lower.indexOf('onsong') >= 0) return 'onsongarchive';
  if (lower.endsWith('.mxl')) return 'mxl';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}
