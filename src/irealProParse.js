/**
 * iReal Pro HTML export → chord-chart candidates.
 * Parses irealb:// / irealbook:// URLs embedded in HTML.
 */
import { createTuneFromChordSheet, parseChordSheetText } from './chordProFormatUtils';

const IREAL_URL_RE = /ireal(?:b|book):\/\/([^"'<\s]+)/gi;

export function isIRealProHtmlFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  if (!name.endsWith('.html') && !name.endsWith('.htm')) return false;
  // Heuristic: name often contains ireal; content checked later
  return true;
}

export function looksLikeIRealProHtml(text) {
  const sample = String(text || '').slice(0, 8000);
  return /ireal(?:b|book):\/\//i.test(sample);
}

function decodeIRealPayload(encoded) {
  let raw = String(encoded || '');
  try {
    raw = decodeURIComponent(raw);
  } catch (e) {
    // keep raw
  }
  return raw;
}

/**
 * Split playlist payload into song segments.
 * Songs are separated by '=' after the first title=composer=style=key=n=chords block.
 * Protocol: title=composer=style=key=n=chordProgression[=nextSong...]
 */
export function splitIRealSongs(payload) {
  const text = decodeIRealPayload(payload);
  if (!text.trim()) return [];

  // Playlist form starts with playlist name then songs; detect by counting '=' fields
  const parts = text.split('=');
  if (parts.length < 6) {
    return [{
      title: parts[0] || 'Untitled',
      composer: parts[1] || '',
      style: parts[2] || '',
      key: parts[3] || '',
      chords: parts.slice(5).join('=') || parts[4] || '',
    }];
  }

  // First component may be playlist name when there are many songs.
  // Each song uses 6 fields: title, composer, style, key, n, chords
  const songs = [];
  let i = 0;
  // If leftover after grouping by 6 suggests playlist header, skip first field
  const fieldCount = parts.length;
  const remainder = fieldCount % 6;
  if (remainder === 1 && fieldCount > 6) {
    i = 1; // playlist name
  }

  while (i + 5 < parts.length) {
    const title = parts[i] || 'Untitled';
    const composer = parts[i + 1] || '';
    const style = parts[i + 2] || '';
    const key = parts[i + 3] || '';
    // parts[i+4] is unused 'n'
    const chords = parts[i + 5] || '';
    songs.push({ title: title, composer: composer, style: style, key: key, chords: chords });
    i += 6;
  }

  if (!songs.length && parts.length >= 1) {
    songs.push({
      title: parts[0] || 'Untitled',
      composer: parts[1] || '',
      style: parts[2] || '',
      key: parts[3] || '',
      chords: parts.slice(5).join('=') || '',
    });
  }
  return songs;
}

/**
 * Convert iReal compact chord progression into a rough chords-over-words / ChordPro-ish chart.
 */
export function irealChordsToChordPro(song) {
  const title = song.title || 'Untitled';
  const artist = song.composer || '';
  const key = song.key || '';
  let body = String(song.chords || '');

  // Normalize common iReal bar markers to readable lines
  body = body
    .replace(/\{\*/g, '\n{')
    .replace(/\*/g, '')
    .replace(/\|/g, ' | ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into measure-ish chunks for readability
  const measures = body.split(/\s*\|\s*/).filter(Boolean);
  const lines = [];
  let current = [];
  measures.forEach(function(m, idx) {
    current.push(m.trim());
    if (current.length >= 4 || idx === measures.length - 1) {
      lines.push(current.map(function(cell) {
        // Wrap chord tokens roughly: "C-7 F7" → "[C-7] [F7]" is too aggressive;
        // leave as comment-style chord line above empty lyric line.
        return cell;
      }).join(' | '));
      current = [];
    }
  });

  let text = '{title: ' + title + '}\n';
  if (artist) text += '{artist: ' + artist + '}\n';
  if (key) text += '{key: ' + key + '}\n';
  if (song.style) text += '{comment: ' + song.style + '}\n';
  text += '\n';
  lines.forEach(function(line) {
    // chords-over-words: chord line then blank lyric
    text += line + '\n\n';
  });
  return text;
}

export function extractIRealUrlsFromHtml(html) {
  const text = String(html || '');
  const urls = [];
  let match;
  const re = new RegExp(IREAL_URL_RE.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

export function irealHtmlToCandidates(html, options) {
  const opts = options || {};
  const payloads = extractIRealUrlsFromHtml(html);
  if (!payloads.length && looksLikeIRealProHtml(html)) {
    // Sometimes the whole body is the URL
    const trimmed = String(html).replace(/^[\s\S]*?(ireal(?:b|book):\/\/)/i, '$1');
    const m = trimmed.match(/ireal(?:b|book):\/\/([^"'<\s]+)/i);
    if (m) payloads.push(m[1]);
  }
  if (!payloads.length) {
    throw new Error('No iReal Pro song data found in that HTML file');
  }

  const songs = [];
  payloads.forEach(function(payload) {
    splitIRealSongs(payload).forEach(function(song) {
      songs.push(song);
    });
  });

  const candidates = [];
  songs.forEach(function(song) {
    const chordPro = irealChordsToChordPro(song);
    let tune;
    try {
      const draft = parseChordSheetText(chordPro);
      tune = createTuneFromChordSheet({
        draft: draft,
        tunebook: opts.tunebook,
        abcjsParser: opts.abcjsParser,
        book: opts.book,
      });
    } catch (e) {
      tune = {
        name: song.title || 'Untitled',
        composer: song.composer || '',
        key: song.key || '',
        books: opts.book ? [opts.book] : [],
        tags: song.style ? [song.style] : [],
        voices: { '1': { meta: '', notes: [] } },
        words: [],
        links: [],
      };
    }
    candidates.push({
      tune: tune,
      sourceKind: 'ireal',
      skipEnrich: true,
      mergeMode: 'suggestOnly',
      mergeStatus: 'new',
      attachmentPolicy: 'suggestOnly',
      rawText: chordPro,
    });
  });

  if (!candidates.length) {
    throw new Error('Could not parse iReal Pro songs');
  }
  return candidates;
}

export async function irealProFileToCandidates(file, options) {
  const text = await new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function() { resolve(String(reader.result || '')); };
    reader.onerror = function() { reject(new Error('Could not read file')); };
    reader.readAsText(file);
  });
  if (!looksLikeIRealProHtml(text) && !String(file.name || '').toLowerCase().match(/ireal/)) {
    // Allow .html that isn't iReal — caller should only route when likely
    if (!extractIRealUrlsFromHtml(text).length) {
      throw new Error('Not an iReal Pro HTML export');
    }
  }
  return irealHtmlToCandidates(text, options);
}
