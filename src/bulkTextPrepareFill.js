/**
 * Rewrite bulk textarea lines with high-confidence YouTube links and
 * title/artist filled from YouTube when possible (stay on Bulk page).
 */
import { formatBulkLine, parseBulkLine } from './bulkListFormat';
import { prepareBulkTextQueue } from './bulkTextPrepare';

/**
 * @returns {Promise<{ text: string, filled: number, enriched: number, prepared: Array }>}
 */
export async function prepareBulkTextIntoTextarea(text, options) {
  const opts = options || {};
  const prepared = await prepareBulkTextQueue(text, opts);
  const list = Array.isArray(prepared) ? prepared : [];
  const lines = String(text || '').split(/\r?\n/);
  const nonEmptyIndexes = [];
  lines.forEach(function(line, index) {
    if (String(line || '').trim()) nonEmptyIndexes.push(index);
  });

  let filled = 0;
  let enriched = 0;
  const nextLines = lines.slice();
  list.forEach(function(candidate, i) {
    const lineIndex = nonEmptyIndexes[i];
    if (lineIndex == null) return;
    const tune = candidate && candidate.tune ? candidate.tune : {};
    const existing = parseBulkLine(lines[lineIndex]) || { title: '', artist: '', link: '' };
    const link = Array.isArray(tune.links) && tune.links[0] && tune.links[0].link
      ? String(tune.links[0].link).trim()
      : '';
    const row = {
      title: tune.name || existing.title || '',
      artist: tune.composer || existing.artist || '',
      link: link || existing.link || '',
    };
    if (candidate && candidate.youtubeAutoselected && link && link !== existing.link) filled += 1;
    else if (candidate && candidate.youtubeAutoselected && link && !existing.link) filled += 1;
    if (candidate && candidate.youtubeMetaEnriched) enriched += 1;
    nextLines[lineIndex] = formatBulkLine(row);
  });

  return {
    text: nextLines.join('\n'),
    filled: filled,
    enriched: enriched,
    prepared: list,
  };
}
