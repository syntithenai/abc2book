import { fetchViaMediaProxy } from './mediaProxyClient';

function extensionFromContentType(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.indexOf('png') >= 0) return 'png';
  if (type.indexOf('webp') >= 0) return 'webp';
  if (type.indexOf('gif') >= 0) return 'gif';
  if (type.indexOf('pdf') >= 0) return 'pdf';
  return 'jpg';
}

function filenameFromUrl(url, contentType) {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split('/').pop() || '';
    if (/\.[a-z0-9]{2,5}$/i.test(base)) {
      return base.slice(0, 120);
    }
  } catch (e) {
    // ignore
  }
  return 'sheet-image.' + extensionFromContentType(contentType);
}

export async function searchSheetImages(options) {
  const { query, accessToken, signal, count } = options;
  const cleaned = String(query || '').trim();
  if (!cleaned) {
    throw new Error('Enter a search query');
  }

  const response = await fetchViaMediaProxy('/search-images', accessToken, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: cleaned, count: count || 24 }),
    signal: signal,
  });

  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Image search returned an unreadable response');
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Image search failed');
  }
  return {
    query: body.query || cleaned,
    results: Array.isArray(body.results) ? body.results : [],
    googleImagesUrl: body.googleImagesUrl || ('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(cleaned)),
  };
}

export async function fetchSheetImageUrlAsFile(options) {
  const { url, accessToken, signal, filename } = options;
  const cleaned = String(url || '').trim();
  if (!cleaned) {
    throw new Error('Image URL is required');
  }
  if (!/^https:\/\//i.test(cleaned)) {
    throw new Error('Only https image URLs are supported');
  }

  const response = await fetchViaMediaProxy('/proxy-audio?url=' + encodeURIComponent(cleaned), accessToken, {
    method: 'GET',
    signal: signal,
  });
  if (!response.ok) {
    let detail = 'Could not download image';
    try {
      const body = await response.json();
      if (body && body.error) detail = body.error;
    } catch (e) {
      // ignore
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const blob = await response.blob();
  if (!blob || !blob.size) {
    throw new Error('Downloaded image was empty');
  }
  const name = filename || filenameFromUrl(cleaned, contentType);
  return new File([blob], name, { type: blob.type || contentType });
}

export function buildGoogleImagesUrl(query) {
  return 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(String(query || '').trim());
}
