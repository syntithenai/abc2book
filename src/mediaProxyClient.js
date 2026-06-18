const PROXY_BASE = (process.env.REACT_APP_MEDIA_PROXY_BASE || '').replace(/\/$/, '');

export function isMediaProxyConfigured() {
  return PROXY_BASE.length > 0;
}

export function getMediaProxyBase() {
  return PROXY_BASE;
}

function buildAuthHeaders(accessToken) {
  if (!accessToken) return {};
  return { Authorization: 'Bearer ' + accessToken };
}

export async function fetchViaMediaProxy(pathAndQuery, accessToken) {
  if (!PROXY_BASE) {
    throw new Error('Media proxy not configured');
  }
  if (!accessToken) {
    throw new Error('Google login required for media proxy');
  }
  const url = PROXY_BASE + pathAndQuery;
  const response = await fetch(url, {
    headers: buildAuthHeaders(accessToken),
  });
  if (!response.ok) {
    let detail = '';
    let hint = '';
    try {
      const body = await response.json();
      detail = body.error || '';
      hint = body.hint || '';
    } catch (e) {}
    const message = 'Media proxy error ' + response.status
      + (detail ? ': ' + detail : '')
      + (hint ? ' (' + hint + ')' : '');
    throw new Error(message);
  }
  return response;
}

async function tryDirectFetch(url) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
  } catch (e) {
    // direct fetch blocked (e.g. CORS)
  }
  return null;
}

export async function fetchDirectOrProxy(options) {
  const { src, srcType, youtubeGetId, accessToken, resolveDirectUrl } = options;

  if (srcType === 'youtube') {
    const videoId = youtubeGetId(src);
    if (!videoId) throw new Error('Invalid YouTube URL');

    // Browser cannot call Piped APIs (CORS). Prefer proxy when configured.
    if (isMediaProxyConfigured()) {
      if (!accessToken) {
        throw new Error('Log in with Google to play or download YouTube audio through the media proxy');
      }
      const response = await fetchViaMediaProxy('/youtube/' + encodeURIComponent(videoId) + '/audio', accessToken);
      return { response: response, viaProxy: true };
    }

    if (resolveDirectUrl) {
      const directUrl = await resolveDirectUrl(src, srcType, youtubeGetId);
      if (directUrl) {
        const response = await tryDirectFetch(directUrl);
        if (response) {
          return { response: response, viaProxy: false };
        }
      }
    }

    throw new Error('Could not resolve YouTube audio stream (configure REACT_APP_MEDIA_PROXY_BASE and log in)');
  }

  const directResponse = await tryDirectFetch(src);
  if (directResponse) {
    return { response: directResponse, viaProxy: false };
  }

  if (!isMediaProxyConfigured() || !accessToken) {
    throw new Error('Direct fetch failed and media proxy is unavailable (log in with an authorized Google account)');
  }

  const response = await fetchViaMediaProxy(
    '/proxy-audio?url=' + encodeURIComponent(src),
    accessToken
  );
  return { response: response, viaProxy: true };
}
