import { fetchViaMediaProxy } from './mediaProxyClient';
import { formatBulkLine } from './bulkListFormat';

export async function formatBulkImportLinesViaResolver(text, accessToken) {
  const response = await fetchViaMediaProxy('/format-bulk-import-lines', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: String(text || '') }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(function() { return ''; });
    throw new Error(errText || 'Bulk line formatting failed');
  }
  const body = await response.json();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  return lines.map(function(row) {
    if (typeof row === 'string') return row;
    return formatBulkLine({
      title: row.title,
      artist: row.artist,
      link: row.link || row.url,
    });
  }).join('\n');
}
