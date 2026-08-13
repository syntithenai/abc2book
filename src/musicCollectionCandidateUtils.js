function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const total = Math.round(value);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ':' + String(secs).padStart(2, '0');
}

function titleFromPath(path) {
  const rel = String(path || '').trim();
  if (!rel) return 'Track';
  const base = rel.split('/').pop() || rel;
  return base.replace(/\.[^.]+$/, '').trim() || 'Track';
}

function cleanUnknown(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower === 'unknown' || lower === '<unknown>') return '';
  return text;
}

function stripTrackPrefix(value) {
  return String(value || '')
    .replace(/^\d{1,3}\s*[-_. )]+\s*/, '')
    .trim();
}

function parseArtistTitleFromFilename(name) {
  const text = stripTrackPrefix(name);
  if (!text) return { artist: '', title: '' };
  const dash = text.match(/^(.+?)\s+-\s+(.+)$/);
  if (dash) {
    return { artist: dash[1].trim(), title: dash[2].trim() };
  }
  return { artist: '', title: text };
}

function inferMetadataFromPath(path) {
  const rel = String(path || '').trim();
  if (!rel) return { artist: '', album: '', title: 'Track' };
  const parts = rel.split('/').filter(Boolean);
  const fileBase = titleFromPath(rel);
  const parsed = parseArtistTitleFromFilename(fileBase);
  const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
  const grandparent = parts.length >= 3 ? parts[parts.length - 3] : '';
  return {
    artist: parsed.artist || grandparent || '',
    album: grandparent ? parent : '',
    title: parsed.title || stripTrackPrefix(fileBase) || 'Track',
  };
}

function buildPublicLink(path, resolverBase) {
  const rel = String(path || '').trim();
  if (!rel) return '';
  const encoded = rel.split('/').map(function(part) {
    return encodeURIComponent(part);
  }).join('/');
  const base = resolverBase ? String(resolverBase).replace(/\/$/, '') : '';
  return base + '/music-collection/' + encoded;
}

export function buildMusicCollectionCandidateFromEntry(entry, resolverBase) {
  if (!entry) return null;
  const path = String(entry.path || '').trim();
  const entryId = String(entry.id || '').trim();
  const inferred = inferMetadataFromPath(path);
  const title = cleanUnknown(entry.title) || inferred.title || titleFromPath(path);
  const artist = cleanUnknown(entry.artist) || inferred.artist;
  const album = cleanUnknown(entry.album) || inferred.album;
  const durationLabel = formatDuration(entry.duration);
  const descriptionParts = [album, durationLabel].filter(Boolean);

  const base = resolverBase ? String(resolverBase).replace(/\/$/, '') : '';
  const candidate = {
    id: entryId,
    title: title,
    artist: artist,
    path: path,
    description: descriptionParts.join(' · '),
    link: entry.link || buildPublicLink(path, base),
    image: entryId && base ? base + '/music-collection-art/' + entryId : (entryId ? '/music-collection-art/' + entryId : ''),
    source: 'music-collection',
    matchScore: Number(entry.matchScore) || 0,
  };

  ['genre', 'year', 'composer', 'duration', 'tracknumber', 'albumartist'].forEach(function(field) {
    const value = entry[field];
    if (value !== undefined && value !== null && value !== '') {
      candidate[field] = value;
    }
  });

  return candidate;
}
