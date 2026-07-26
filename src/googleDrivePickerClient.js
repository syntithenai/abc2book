function extractDriveFileId(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text) && text.indexOf('/') === -1) return text;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return '';
}

export function parseDriveFileInput(input) {
  return extractDriveFileId(input);
}

/** Coerce picker objects, URLs, or plain ids into a Drive file id string. */
export function normalizeDriveFileId(input) {
  if (input == null || input === '') return '';
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed.indexOf('[object') >= 0) return '';
    const parsed = extractDriveFileId(trimmed);
    return parsed || trimmed;
  }
  if (typeof input === 'object') {
    if (input.error) return '';
    if (typeof input.id === 'string') return input.id.trim();
    if (typeof input.driveFileId === 'string') return input.driveFileId.trim();
    if (typeof input.googleId === 'string') return input.googleId.trim();
    if (typeof input.fileId === 'string') return input.fileId.trim();
  }
  return '';
}

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function tokenHasDriveAccess(token) {
  const scope = token && token.scope ? String(token.scope) : '';
  if (!scope) return false;
  return scope.indexOf('drive.file') >= 0
    || scope.indexOf('drive.readonly') >= 0
    || scope.indexOf('/auth/drive') >= 0;
}

/** Request drive.file only when the user explicitly needs Drive (never on login). */
export function ensureDriveFileScope(requestGoogleScopes, token) {
  if (tokenHasDriveAccess(token)) {
    return Promise.resolve(token);
  }
  if (typeof requestGoogleScopes !== 'function') {
    return Promise.resolve(null);
  }
  return requestGoogleScopes([GOOGLE_DRIVE_FILE_SCOPE])
    .then(function(updated) { return updated || token; })
    .catch(function() { return null; });
}

export async function fetchDriveFileText(driveApi, fileId, accessToken) {
  if (!driveApi || !fileId) throw new Error('Drive file id required');
  const meta = await new Promise(function(resolve, reject) {
    driveApi.getDocumentMeta(fileId).then(resolve).catch(reject);
  });
  const mime = meta && meta.mimeType ? meta.mimeType : '';
  if (mime.indexOf('google-apps') >= 0) {
    const exported = await new Promise(function(resolve, reject) {
      driveApi.exportDocument(fileId).then(resolve).catch(reject);
    });
    return String(exported || '');
  }
  const doc = await new Promise(function(resolve, reject) {
    driveApi.getDocument(fileId).then(resolve).catch(reject);
  });
  return String(doc || '');
}

export async function fetchDriveFileBlob(driveApi, fileId) {
  if (!driveApi || !fileId) throw new Error('Drive file id required');
  return new Promise(function(resolve, reject) {
    driveApi.getDocumentBlob(fileId).then(resolve).catch(reject);
  });
}

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

function loadGooglePickerApi() {
  return new Promise(function(resolve, reject) {
    if (typeof window === 'undefined' || !window.gapi) {
      reject(new Error('Google API is not loaded yet.'));
      return;
    }
    window.gapi.load('picker', {
      callback: resolve,
      onerror: function() { reject(new Error('Could not load Google Picker.')); },
    });
  });
}

export async function openGoogleDrivePicker(options) {
  const opts = options || {};
  const accessToken = opts.accessToken;
  const apiKey = opts.apiKey || process.env.REACT_APP_GOOGLE_API_KEY;
  if (!accessToken) throw new Error('Log in with Google first.');
  if (!apiKey) {
    throw new Error('Google API key is not configured for Drive picker.');
  }

  await loadGooglePickerApi();
  if (!window.google || !window.google.picker) {
    throw new Error('Google Picker is unavailable.');
  }

  return new Promise(function(resolve, reject) {
    const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setIncludeFolders(false);
    if (Array.isArray(opts.mimeTypes) && opts.mimeTypes.length > 0) {
      docsView.setMimeTypes(opts.mimeTypes.join(','));
    } else if (typeof opts.mimeTypes === 'string' && opts.mimeTypes.trim()) {
      docsView.setMimeTypes(opts.mimeTypes);
    }

    const picker = new window.google.picker.PickerBuilder()
      .addView(docsView)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle(opts.title || 'Choose a file');
    if (opts.multiSelect) {
      picker.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    }
    picker.setCallback(function(data) {
        if (!data) return;
        if (data.action === window.google.picker.Action.PICKED && data.docs && data.docs.length) {
          resolve(opts.multiSelect ? data.docs : data.docs[0]);
          return;
        }
        if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('Drive picker cancelled'));
        }
      })
      .build();
    picker.setVisible(true);
  });
}
