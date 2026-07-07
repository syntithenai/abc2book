export function parseBulkLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  let titlePart = trimmed;
  let link = '';

  const pipeIdx = trimmed.indexOf('|');
  if (pipeIdx >= 0) {
    titlePart = trimmed.slice(0, pipeIdx).trim();
    link = trimmed.slice(pipeIdx + 1).trim();
  }

  if (/^https?:\/\//i.test(trimmed) && !titlePart) {
    return { title: '', artist: '', link: trimmed };
  }

  const byMatch = titlePart.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { title: byMatch[1].trim(), artist: byMatch[2].trim(), link: link };
  }

  const dash = titlePart.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (dash) {
    return { title: dash[1].trim(), artist: dash[2].trim(), link: link };
  }

  const tabParts = titlePart.split('\t').map(function(p) { return p.trim(); }).filter(Boolean);
  if (tabParts.length >= 2) {
    return {
      title: tabParts[0],
      artist: tabParts[1],
      link: link || tabParts[2] || '',
    };
  }

  return { title: titlePart, artist: '', link: link };
}

export function formatBulkLine(row) {
  const title = String(row.title || '').trim();
  const artist = String(row.artist || '').trim();
  const link = String(row.link || '').trim();
  let line = title;
  if (artist) line = title + ' by ' + artist;
  if (link) line = line + ' | ' + link;
  return line.trim();
}

export function normalizeBulkTextLocally(text) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = [];
  lines.forEach(function(line) {
    const parsed = parseBulkLine(line);
    if (!parsed || (!parsed.title && !parsed.link)) return;
    rows.push(formatBulkLine(parsed));
  });
  return rows.join('\n');
}

export function bulkLinesToCandidates(lines, tunebook, book) {
  const candidates = [];
  lines.forEach(function(line) {
    const parsed = parseBulkLine(line);
    if (!parsed) return;
    const tune = {
      name: parsed.title || 'Untitled',
      composer: parsed.artist || '',
      links: parsed.link ? [{ link: parsed.link, title: '', startAt: '', endAt: '' }] : [],
      voices: { '1': { meta: '', notes: [] } },
      books: book ? [book] : [],
    };
    candidates.push({
      tune: tune,
      sourceKind: 'bulk-text',
      youtubeUrl: parsed.link && /youtube|youtu\.be/i.test(parsed.link) ? parsed.link : '',
    });
  });
  return candidates;
}

export function driveListTextToBulkLines(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const lines = trimmed.split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length <= 1) return trimmed;

  const first = lines[0];
  if (first.indexOf(',') >= 0 && !first.match(/^X:/)) {
    const header = first.toLowerCase();
    const hasTitle = header.indexOf('title') >= 0 || header.indexOf('name') >= 0 || header.indexOf('song') >= 0;
    if (hasTitle) {
      const cols = first.split(',').map(function(c) { return c.trim().toLowerCase(); });
      const titleIdx = cols.findIndex(function(c) { return c.indexOf('title') >= 0 || c === 'name' || c.indexOf('song') >= 0; });
      const artistIdx = cols.findIndex(function(c) { return c.indexOf('artist') >= 0 || c.indexOf('composer') >= 0; });
      const linkIdx = cols.findIndex(function(c) { return c.indexOf('url') >= 0 || c.indexOf('link') >= 0 || c.indexOf('youtube') >= 0; });
      const rows = [];
      lines.slice(1).forEach(function(line) {
        const parts = line.split(',').map(function(c) { return c.trim(); });
        rows.push(formatBulkLine({
          title: titleIdx >= 0 ? parts[titleIdx] : parts[0],
          artist: artistIdx >= 0 ? parts[artistIdx] : '',
          link: linkIdx >= 0 ? parts[linkIdx] : '',
        }));
      });
      return rows.join('\n');
    }
  }

  return normalizeBulkTextLocally(trimmed);
}
