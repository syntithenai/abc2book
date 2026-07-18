/**
 * OnSong .onsongarchive / OnSong-style .backup → chord-sheet candidates.
 */
import { unzipArchive, isChordSheetMemberName } from './importArchiveParser';
import { parseImportText } from './importSourceParse';

export function isOnsongArchiveFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.onsongarchive')) return true;
  // Generic .backup is ambiguous; only treat as OnSong when name hints it
  if (name.endsWith('.backup') && (name.indexOf('onsong') >= 0 || name.indexOf('song') >= 0)) {
    return true;
  }
  return false;
}

function isLikelySongMember(name) {
  if (isChordSheetMemberName(name)) return true;
  const lower = String(name || '').toLowerCase();
  if (!lower || lower.endsWith('/')) return false;
  if (lower.indexOf('__macosx/') >= 0) return false;
  if (lower.endsWith('.json') || lower.endsWith('.plist') || lower.endsWith('.xml')) return false;
  // OnSong archives sometimes store songs without extension
  if (lower.indexOf('/songs/') >= 0 || lower.indexOf('songs/') === 0) return true;
  return false;
}

export async function onsongArchiveFileToCandidates(file, options) {
  const opts = options || {};
  const { entries, names } = await unzipArchive(file);
  const members = names.filter(isLikelySongMember);
  if (!members.length) {
    throw new Error('No OnSong songs found in that archive');
  }

  const candidates = [];
  const setlists = [];

  for (let i = 0; i < members.length; i += 1) {
    const name = members[i];
    const entry = entries[name];
    if (!entry) continue;
    let text = await entry.text();
    // Skip binary-looking blobs
    if (!text || text.indexOf('\u0000') >= 0) continue;
    const baseName = name.split('/').pop() || name;
    try {
      const parsed = parseImportText({
        text: text,
        fileName: baseName.endsWith('.onsong') || baseName.endsWith('.txt') || baseName.endsWith('.cho')
          ? baseName
          : baseName + '.onsong',
        tunebook: opts.tunebook,
        abcjsParser: opts.abcjsParser,
        book: opts.book,
      });
      (parsed || []).forEach(function(c) {
        candidates.push(Object.assign({}, c, {
          sourceKind: 'onsong',
          skipEnrich: true,
          mergeMode: 'suggestOnly',
          bundleSource: file.name,
        }));
      });
    } catch (e) {
      // skip unparseable members
    }
  }

  // Optional setlist JSON members
  names.forEach(function(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.indexOf('setlist') >= 0 && lower.endsWith('.json')) {
      setlists.push(name);
    }
  });

  if (!candidates.length) {
    throw new Error('Could not parse any songs from that OnSong archive');
  }
  if (candidates[0] && setlists.length) {
    candidates[0].onsongSideEffects = { setlistEntryNames: setlists };
  }
  return candidates;
}
