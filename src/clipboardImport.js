const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/midi': 'mid',
  'audio/mid': 'mid',
  'application/vnd.recordare.musicxml+xml': 'musicxml',
  'application/xml': 'xml',
  'text/plain': 'txt',
};

export function extensionForMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (MIME_EXTENSIONS[normalized]) return MIME_EXTENSIONS[normalized];
  const parts = normalized.split('/');
  if (parts.length === 2 && parts[1] && parts[1] !== '*' && !parts[1].includes('+')) {
    return parts[1].replace(/^x-/, '');
  }
  return 'bin';
}

export function blobToImportFile(blob, mimeType, id) {
  const mime = String(mimeType || (blob && blob.type) || '').toLowerCase();
  const ext = extensionForMime(mime);
  const prefix = mime.startsWith('image/')
    ? 'pasted-image'
    : mime.startsWith('audio/')
      ? 'pasted-audio'
      : 'pasted-file';
  const suffix = id != null ? String(id) : String(Date.now());
  return new File([blob], prefix + '-' + suffix + '.' + ext, { type: mime || (blob && blob.type) || '' });
}

export function readClipboardPasteEvent(event) {
  const dt = event && event.clipboardData;
  if (!dt) return { text: '', files: [] };

  const files = [];
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i += 1) {
      const item = dt.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (files.length === 0 && dt.files && dt.files.length) {
    for (let i = 0; i < dt.files.length; i += 1) {
      files.push(dt.files[i]);
    }
  }
  if (files.length > 0) {
    return { text: '', files: files };
  }
  return { text: dt.getData('text/plain') || '', files: [] };
}

export async function readSystemClipboard() {
  if (!navigator.clipboard) {
    throw new Error('Clipboard API not available');
  }
  if (typeof navigator.clipboard.read === 'function') {
    const clipItems = await navigator.clipboard.read();
    const files = [];
    let text = '';
    let fileId = 0;

    for (let i = 0; i < clipItems.length; i += 1) {
      const item = clipItems[i];
      const types = item.types || [];
      const binaryTypes = types.filter(function(type) {
        return type !== 'text/plain' && type !== 'text/html';
      });

      for (let t = 0; t < types.length; t += 1) {
        const type = types[t];
        if (type === 'text/html') continue;

        const blob = await item.getType(type);
        if (type === 'text/plain') {
          if (binaryTypes.length === 0) {
            const chunk = await blob.text();
            if (chunk) text = text ? text + '\n' + chunk : chunk;
          }
          continue;
        }

        fileId += 1;
        files.push(blobToImportFile(blob, type, fileId));
      }
    }

    return { text: text, files: files };
  }
  if (typeof navigator.clipboard.readText === 'function') {
    const clipText = await navigator.clipboard.readText();
    return { text: String(clipText || ''), files: [] };
  }
  throw new Error('Clipboard API not available');
}
