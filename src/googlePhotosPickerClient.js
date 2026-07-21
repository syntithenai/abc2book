export const GOOGLE_PHOTOS_PICKER_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

function accessTokenValue(token) {
  if (!token) return '';
  if (typeof token === 'string') return token;
  return token.access_token || '';
}

export function tokenResponseIncludesPhotosScope(tokenResponse) {
  const scope = tokenResponse && tokenResponse.scope ? String(tokenResponse.scope) : '';
  return scope.indexOf('photospicker') >= 0;
}

export async function tokenHasPhotosScope(accessToken) {
  const token = accessTokenValue(accessToken);
  if (!token) return false;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + encodeURIComponent(token));
  if (!response.ok) return false;
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    return false;
  }
  const scope = body && body.scope ? String(body.scope) : '';
  return scope.indexOf('photospicker') >= 0;
}

function parseGoogleDuration(value, fallbackMs) {
  const match = String(value || '').match(/^([\d.]+)s$/);
  if (!match) return fallbackMs;
  return Math.max(500, Math.round(parseFloat(match[1]) * 1000));
}

async function pickerRequest(path, accessToken, options) {
  const token = accessTokenValue(accessToken);
  if (!token) {
    throw new Error('Google sign-in is required');
  }
  const response = await fetch('https://photospicker.googleapis.com/v1' + path, Object.assign({}, options, {
    headers: Object.assign({
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
    }, options && options.headers ? options.headers : {}),
  }));
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    body = null;
  }
  if (!response.ok) {
    const detail = body && body.error && body.error.message
      ? body.error.message
      : 'Google Photos request failed';
    if (/insufficient authentication scopes/i.test(detail)) {
      throw new Error('Google Photos permission is missing from your sign-in token. Click Choose photo again and approve photo access on the Google consent screen.');
    }
    throw new Error(detail);
  }
  return body;
}

export function buildGooglePhotosPickerUrl(pickerUri) {
  const base = String(pickerUri || '').replace(/\/$/, '');
  return base + '/autoclose';
}

export async function createGooglePhotosPickerSession(accessToken, options) {
  const maxItemCount = options && options.maxItemCount ? options.maxItemCount : 1;
  return pickerRequest('/sessions', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pickingConfig: { maxItemCount: String(maxItemCount) },
    }),
  });
}

export async function getGooglePhotosPickerSession(accessToken, sessionId) {
  return pickerRequest('/sessions/' + encodeURIComponent(sessionId), accessToken, {
    method: 'GET',
  });
}

export async function listGooglePhotosPickedMedia(accessToken, sessionId) {
  return pickerRequest('/mediaItems?sessionId=' + encodeURIComponent(sessionId), accessToken, {
    method: 'GET',
  });
}

export async function deleteGooglePhotosPickerSession(accessToken, sessionId) {
  try {
    await pickerRequest('/sessions/' + encodeURIComponent(sessionId), accessToken, {
      method: 'DELETE',
    });
  } catch (e) {
    // Best-effort cleanup.
  }
}

function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

export async function waitForGooglePhotosPickerSelection(accessToken, session, onProgress) {
  const sessionId = session && session.id;
  if (!sessionId) {
    throw new Error('Google Photos session is missing an id');
  }
  const pollInterval = parseGoogleDuration(session.pollingConfig && session.pollingConfig.pollInterval, 3000);
  const timeoutMs = parseGoogleDuration(session.pollingConfig && session.pollingConfig.timeoutIn, 300000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const current = await getGooglePhotosPickerSession(accessToken, sessionId);
    if (current && current.mediaItemsSet) {
      return current;
    }
    if (typeof onProgress === 'function') {
      onProgress('Waiting for your photo selection in Google Photos...');
    }
    await sleep(pollInterval);
  }
  throw new Error('Google Photos selection timed out. Pick a photo and tap Done, then try again.');
}

function normalizePickedMediaItems(body) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.mediaItems)) return body.mediaItems;
  if (Array.isArray(body.pickedMediaItems)) return body.pickedMediaItems;
  return [];
}

function isVideoMediaItem(mediaItem, mimeType) {
  return !!(mediaItem && (mediaItem.type === 'VIDEO' || String(mimeType || '').indexOf('video/') === 0))
}

export async function fetchGooglePhotoAsFile(accessToken, mediaItem, options) {
  const opts = options || {}
  const allowVideos = !!opts.allowVideos
  const convertVideosToAudio = opts.convertVideosToAudio !== false
  const token = accessTokenValue(accessToken)
  const mediaFile = mediaItem && mediaItem.mediaFile ? mediaItem.mediaFile : null
  if (!mediaFile || !mediaFile.baseUrl) {
    throw new Error('Selected item has no downloadable media')
  }
  const mimeType = mediaFile.mimeType || 'image/jpeg'
  const isVideo = isVideoMediaItem(mediaItem, mimeType)
  if (isVideo && !allowVideos) {
    throw new Error('Videos are not supported for sheet import. Pick a photo instead.')
  }
  const response = await fetch(mediaFile.baseUrl + '=d', {
    headers: { Authorization: 'Bearer ' + token },
  })
  if (!response.ok) {
    throw new Error(isVideo
      ? 'Could not download the selected video from Google Photos'
      : 'Could not download the selected photo from Google Photos')
  }
  const blob = await response.blob()
  if (!blob || !blob.size) {
    throw new Error(isVideo ? 'Downloaded video was empty' : 'Downloaded photo was empty')
  }
  const filename = String(mediaFile.filename || (isVideo ? 'google-video.mp4' : 'google-photo.jpg')).slice(0, 120)
  let file = new File([blob], filename, { type: blob.type || mimeType })
  if (isVideo && convertVideosToAudio) {
    const { convertVideoFileToAudioFile } = await import('./videoToAudioFile')
    if (typeof opts.onProgress === 'function') {
      opts.onProgress('Converting video to audio...')
    }
    file = await convertVideoFileToAudioFile(file)
  }
  return file
}

export async function pickGooglePhotosAndDownload(accessToken, options) {
  const onProgress = options && options.onProgress;
  const maxItemCount = options && options.maxItemCount ? options.maxItemCount : 1;
  const allowVideos = !!(options && options.allowVideos);
  const convertVideosToAudio = !options || options.convertVideosToAudio !== false;
  const openPicker = options && options.openPicker;
  let session = null;

  try {
    if (typeof onProgress === 'function') onProgress('Starting Google Photos picker...');
    session = await createGooglePhotosPickerSession(accessToken, { maxItemCount: maxItemCount });
    const pickerUrl = buildGooglePhotosPickerUrl(session.pickerUri);
    if (typeof openPicker === 'function') {
      openPicker(pickerUrl);
    }
    await waitForGooglePhotosPickerSelection(accessToken, session, onProgress);
    if (typeof onProgress === 'function') {
      onProgress(allowVideos ? 'Downloading selected media...' : 'Downloading selected photo...');
    }
    const listed = await listGooglePhotosPickedMedia(accessToken, session.id);
    const items = normalizePickedMediaItems(listed).filter(function(item) {
      if (!item) return false;
      if (item.type === 'VIDEO') return allowVideos;
      return true;
    });
    if (!items.length) {
      throw new Error(allowVideos ? 'No photos or videos were selected' : 'No photos were selected');
    }
    const files = []
    for (let i = 0; i < items.length; i += 1) {
      if (typeof onProgress === 'function' && items.length > 1) {
        onProgress('Downloading item ' + (i + 1) + ' of ' + items.length + '...')
      }
      files.push(await fetchGooglePhotoAsFile(accessToken, items[i], {
        allowVideos: allowVideos,
        convertVideosToAudio: convertVideosToAudio,
        onProgress: onProgress,
      }))
    }
    return {
      files: files,
      sessionId: session.id,
    };
  } finally {
    if (session && session.id) {
      await deleteGooglePhotosPickerSession(accessToken, session.id);
    }
  }
}
