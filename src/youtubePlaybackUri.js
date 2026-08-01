const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Broad YouTube URI detection (m.youtube, music.youtube, shorts, bare id). */
export function isYoutubePlaybackUri(src, youtubeGetId) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  if (/youtu/i.test(trimmed)) return true;
  const getId = typeof youtubeGetId === 'function' ? youtubeGetId : null;
  if (getId) {
    const videoId = getId(trimmed);
    if (videoId && YOUTUBE_ID_RE.test(videoId)) return true;
  }
  return YOUTUBE_ID_RE.test(trimmed);
}

export function normalizeYoutubePlaybackUri(src, youtubeGetId) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return trimmed;
  const getId = typeof youtubeGetId === 'function' ? youtubeGetId : null;
  const videoId = getId ? getId(trimmed) : (YOUTUBE_ID_RE.test(trimmed) ? trimmed : null);
  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) return trimmed;
  return 'https://www.youtube.com/watch?v=' + videoId;
}

/** Unwrap /proxy-audio?url=… links saved or copied from the resolver. */
export function unwrapResolverProxyAudioUri(src) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.replace(/\/$/, '') !== '/proxy-audio') return trimmed;
    const inner = parsed.searchParams.get('url');
    return inner ? String(inner).trim() : trimmed;
  } catch (e) {
    return trimmed;
  }
}

export function normalizeRemotePlaybackPayload(payload, youtubeGetId) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = Object.assign({}, payload);
  let source = unwrapResolverProxyAudioUri(next.source);
  if (isYoutubePlaybackUri(source, youtubeGetId)) {
    source = normalizeYoutubePlaybackUri(source, youtubeGetId);
    next.source = source;
    next.sourceType = 'youtube';
  } else {
    next.source = source;
  }
  if (Array.isArray(next.queue) && next.queue.length > 0) {
    next.queue = next.queue.map(function(entry) {
      if (!entry || typeof entry !== 'object') return entry;
      const item = Object.assign({}, entry);
      let itemSource = unwrapResolverProxyAudioUri(item.source || item.sourceUrl);
      if (isYoutubePlaybackUri(itemSource, youtubeGetId)) {
        itemSource = normalizeYoutubePlaybackUri(itemSource, youtubeGetId);
        item.source = itemSource;
        item.sourceType = 'youtube';
      } else {
        item.source = itemSource;
      }
      return item;
    });
  }
  return next;
}
