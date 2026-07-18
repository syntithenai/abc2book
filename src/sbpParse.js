/**
 * Songbook Pro .sbp / .sbpbackup → review candidates.
 * Archive is ZIP with dataFile.txt (version line + JSON).
 */
import { unzipArchive, findArchiveEntry } from './importArchiveParser';
import { createTuneFromChordSheet, parseChordSheetText } from './chordProFormatUtils';

export function isSbpFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  return name.endsWith('.sbp') || name.endsWith('.sbpbackup');
}

function parseDataFileText(text) {
  const raw = String(text || '');
  // Version header then JSON (often one line)
  const nl = raw.search(/\r?\n/);
  let jsonPart = raw;
  if (nl >= 0) {
    const first = raw.slice(0, nl).trim();
    if (/^\d+(\.\d+)*$/.test(first) || first.toLowerCase().indexOf('songbook') >= 0) {
      jsonPart = raw.slice(nl).replace(/^\r?\n/, '');
    }
  }
  const data = JSON.parse(jsonPart.trim());
  return data;
}

function songToChordProText(song) {
  if (!song || typeof song !== 'object') return '';
  if (typeof song.content === 'string' && song.content.trim()) {
    return song.content;
  }
  if (typeof song.chordPro === 'string' && song.chordPro.trim()) {
    return song.chordPro;
  }
  if (typeof song.chords === 'string' && song.chords.trim()) {
    return song.chords;
  }
  if (typeof song.lyrics === 'string' && song.lyrics.trim()) {
    const title = song.title || song.name || 'Untitled';
    const artist = song.artist || song.composer || '';
    let text = '{title: ' + title + '}\n';
    if (artist) text += '{artist: ' + artist + '}\n';
    if (song.key) text += '{key: ' + song.key + '}\n';
    if (song.capo != null && song.capo !== '') text += '{capo: ' + song.capo + '}\n';
    text += '\n' + song.lyrics;
    return text;
  }
  return '';
}

function songMeta(song) {
  return {
    title: song.title || song.name || '',
    artist: song.artist || song.composer || '',
    key: song.key || '',
    capo: song.capo,
    tags: song.tags || song.x_sbp_tags || [],
  };
}

/**
 * Parse SBP backup into candidates + optional set/folder side data.
 */
export async function parseSbpArchive(input, options) {
  const opts = options || {};
  const { entries } = await unzipArchive(input);
  const dataEntry = findArchiveEntry(entries, 'dataFile.txt');
  if (!dataEntry) {
    throw new Error('Songbook Pro archive is missing dataFile.txt');
  }
  const text = await dataEntry.text();
  let data;
  try {
    data = parseDataFileText(text);
  } catch (e) {
    throw new Error('Could not parse Songbook Pro library data');
  }

  const songs = Array.isArray(data.songs) ? data.songs
    : (Array.isArray(data.Songs) ? data.Songs : []);
  const sets = Array.isArray(data.sets) ? data.sets
    : (Array.isArray(data.Sets) ? data.Sets : []);
  const folders = Array.isArray(data.folders) ? data.folders
    : (Array.isArray(data.Folders) ? data.Folders : []);

  const candidates = [];
  songs.forEach(function(song, index) {
    const chordText = songToChordProText(song);
    const meta = songMeta(song);
    let tune = null;
    if (chordText.trim()) {
      try {
        const draft = parseChordSheetText(chordText);
        if (!draft.title && meta.title) draft.title = meta.title;
        if (!draft.artist && meta.artist) draft.artist = meta.artist;
        tune = createTuneFromChordSheet({
          draft: draft,
          tunebook: opts.tunebook,
          abcjsParser: opts.abcjsParser,
          book: opts.book,
        });
      } catch (e) {
        tune = null;
      }
    }
    if (!tune) {
      tune = {
        name: meta.title || ('Song ' + (index + 1)),
        composer: meta.artist || '',
        key: meta.key || '',
        capo: meta.capo,
        books: opts.book ? [opts.book] : [],
        tags: Array.isArray(meta.tags) ? meta.tags.slice() : [],
        voices: { '1': { meta: '', notes: [] } },
        words: [],
        links: [],
      };
    }
    if (Array.isArray(meta.tags) && meta.tags.length) {
      const tags = Array.isArray(tune.tags) ? tune.tags.slice() : [];
      meta.tags.forEach(function(tag) {
        const t = String(tag || '').trim();
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
      tune.tags = tags;
    }
    candidates.push({
      tune: tune,
      sourceKind: 'sbp',
      skipEnrich: true,
      mergeMode: 'suggestOnly',
      mergeStatus: 'new',
      attachmentPolicy: 'suggestOnly',
      bundleSource: opts.fileName || 'library.sbp',
      sbpSongId: song.id || song.Id || null,
    });
  });

  return {
    candidates: candidates,
    sets: sets,
    folders: folders,
    raw: data,
  };
}

export async function sbpFileToCandidates(file, options) {
  const parsed = await parseSbpArchive(file, Object.assign({}, options, {
    fileName: file && file.name,
  }));
  if (!parsed.candidates.length) {
    throw new Error('No songs found in that Songbook Pro file');
  }
  // Attach side effects on first candidate for post-import hooks
  if (parsed.candidates[0]) {
    parsed.candidates[0].sbpSideEffects = {
      sets: parsed.sets,
      folders: parsed.folders,
    };
  }
  return parsed.candidates;
}
