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

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

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
  if (!apiKey) throw new Error('Google API key is not configured for Drive picker.');

  await loadGooglePickerApi();
  if (!window.google || !window.google.picker) {
    throw new Error('Google Picker is unavailable.');
  }

  return new Promise(function(resolve, reject) {
    const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setIncludeFolders(false);
    if (Array.isArray(opts.mimeTypes) && opts.mimeTypes.length > 0) {
      docsView.setMimeTypes(opts.mimeTypes.join(','));
    }

    const picker = new window.google.picker.PickerBuilder()
      .addView(docsView)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle(opts.title || 'Choose a file')
      .setCallback(function(data) {
        if (!data) return;
        if (data.action === window.google.picker.Action.PICKED && data.docs && data.docs[0]) {
          resolve(data.docs[0]);
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

export { DRIVE_READONLY_SCOPE };
