/**
 * Re-parse bulk line title portions using YouTube title heuristics.
 */
import { formatBulkLine, parseBulkLine } from './bulkListFormat';
import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse';

function titlePartFromLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';
  const pipeIdx = trimmed.indexOf('|');
  if (pipeIdx >= 0) return trimmed.slice(0, pipeIdx).trim();
  return trimmed;
}

export function retidyBulkLine(line, options) {
  const opts = options || {};
  const trimmed = String(line || '').trim();
  if (!trimmed) return trimmed;

  const parsed = parseBulkLine(trimmed);
  if (!parsed) return trimmed;

  const titlePart = titlePartFromLine(trimmed);
  const yt = parseTitleArtistFromYouTubeLabel(titlePart, opts.channelName || '');
  const row = {
    title: yt.title || parsed.title || '',
    artist: yt.artist || parsed.artist || '',
    link: parsed.link || '',
  };

  if (!row.title && !row.link) return trimmed;
  return formatBulkLine(row);
}

export function retidyBulkText(text, options) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map(function(line) {
    return retidyBulkLine(line, options);
  }).join('\n');
}
