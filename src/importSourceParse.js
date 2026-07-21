import { isMusicXmlText } from './mxlExtract';
import { audioFileAcceptList, isAudioImportFile, mediaFileAcceptList } from './audioFileMetadata';
import {
  parseChordSheetText,
  createTuneFromChordSheet,
  isChordSheetFilename,
  detectChordSheetFormat,
} from './chordProFormatUtils';
import { detectScoreFormat, importMusicXmlText, importScoreFile } from './scoreImportClient';
import {
  parseDriveFileInput,
  fetchDriveFileText,
  fetchDriveFileBlob,
} from './googleDrivePickerClient';
import { parseBulkLine } from './bulkListFormat';
import { transcribeSheetImageFile } from './sheetImageTranscriptionClient';
import { buildDraftFromSheetImageResult, createTuneFromSheetImageImport } from './sheetImageImportUtils';
import { createImportCandidate } from './importReviewSession';
import { ensurePlainWordsFromNoteAlignedLyrics } from './wLinesUtils';

const CHORD_SHEET_EXTENSIONS = ['.cho', '.pro', '.crd', '.onsong'];

export function isChordSheetExtension(fileName) {
  const lower = String(fileName || '').toLowerCase();
  return CHORD_SHEET_EXTENSIONS.some(function(ext) { return lower.endsWith(ext); });
}

export function detectTextImportFormat(text, fileName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  if (isMusicXmlText(trimmed)) return 'musicxml';
  if (isChordSheetExtension(fileName)) return 'chordsheet';
  if (/^X:\s*\d/m.test(trimmed)) return 'abc';
  const chordFormat = detectChordSheetFormat(trimmed);
  if (chordFormat === 'chordpro' || chordFormat === 'onsong') return 'chordsheet';
  if (chordFormat === 'chords-over-words') {
    try {
      parseChordSheetText(trimmed);
      return 'chordsheet';
    } catch (e) {
      return 'abc';
    }
  }
  if (String(fileName || '').toLowerCase().endsWith('.txt')) {
    try {
      parseChordSheetText(trimmed);
      return 'chordsheet';
    } catch (e) {
      return 'abc';
    }
  }
  if (isChordSheetFilename(fileName)) return 'chordsheet';
  return 'abc';
}

export function readFileAsText(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function() { resolve(String(reader.result || '')); };
    reader.onerror = function() { reject(new Error('Could not read file')); };
    reader.readAsText(file);
  });
}

export function abcTextToCandidates(abcText, tunebook, book) {
  const tunes = tunebook.abcTools.abc2Tunebook(abcText);
  return tunes.map(function(tune) {
    if (book && Array.isArray(tune.books)) {
      const books = tune.books.slice();
      if (books.indexOf(book) === -1) books.push(book);
      tune.books = books;
    } else if (book) {
      tune.books = [book];
    }
    ensurePlainWordsFromNoteAlignedLyrics(tune);
    return {
      tune: tune,
      sourceKind: 'abc',
      rawText: null,
    };
  });
}

export function chordSheetTextToCandidate(text, tunebook, abcjsParser, book) {
  const draft = parseChordSheetText(text);
  const tune = createTuneFromChordSheet({
    draft: draft,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
    book: book,
  });
  return {
    tune: tune,
    sourceKind: 'chordsheet',
    rawText: text,
  };
}

export async function parseImportFile(options) {
  const file = options.file;
  const tunebook = options.tunebook;
  const abcjsParser = options.abcjsParser;
  const book = options.book;
  const accessToken = options.accessToken;
  const resolverAvailable = options.resolverAvailable !== false;
  const onProgress = options.onProgress;

  if (!file) throw new Error('No file selected');

  const scoreFormat = detectScoreFormat(file.name);
  if (scoreFormat === 'midi' && !resolverAvailable) {
    throw new Error('MIDI import needs the media resolver.');
  }

  if (isChordSheetExtension(file.name) || scoreFormat === 'abc') {
    const text = await readFileAsText(file);
    return parseImportText({ text: text, fileName: file.name, tunebook, abcjsParser, book });
  }

  const result = await importScoreFile({
    file: file,
    accessToken: accessToken,
    onProgress: onProgress,
  });
  return abcTextToCandidates(result.abc, tunebook, book).map(function(c) {
    c.sourceKind = scoreFormat || 'musicxml';
    return c;
  });
}

export function parseImportText(options) {
  const text = String(options.text || '');
  const fileName = options.fileName || 'pasted.txt';
  const tunebook = options.tunebook;
  const abcjsParser = options.abcjsParser;
  const book = options.book;

  const format = detectTextImportFormat(text, fileName);
  if (format === 'musicxml') {
    const result = importMusicXmlText(text, fileName);
    return abcTextToCandidates(result.abc, tunebook, book).map(function(c) {
      c.sourceKind = 'musicxml';
      return c;
    });
  }
  if (format === 'chordsheet') {
    return [chordSheetTextToCandidate(text, tunebook, abcjsParser, book)];
  }
  return abcTextToCandidates(text, tunebook, book);
}

export const OFFLINE_FILE_ACCEPT = '.abc,.txt,.xml,.musicxml,.mxl,.cho,.pro,.crd,.onsong,.zip,.mscz,.sbp,.sbpbackup,.onsongarchive,.html,.htm,application/vnd.recordare.musicxml+xml,application/xml,text/plain,application/zip';
export const MIDI_FILE_ACCEPT = ',.mid,.midi,audio/midi,audio/mid';
/** Score formats commonly downloadable from MuseScore (and paste-dialog file pick). */
export const NOTATION_DOWNLOAD_FILE_ACCEPT =
  '.mscz,.musicxml,.xml,.mxl,.abc,.mid,.midi,'
  + 'application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,'
  + 'application/x-musescore,application/xml,audio/midi,audio/mid'
export const AUDIO_FILE_ACCEPT = ',.mp3,.flac,.m4a,.ogg,.wav,.aac,.wma,.opus,.webm,audio/*';

export const BULK_TEXT_FILE_ACCEPT = '.txt,.csv,.tsv,.abc,text/plain';
export const SHEET_IMAGE_FILE_ACCEPT = ',image/*,application/pdf,.pdf';

export function fileAcceptList(resolverAvailable) {
  return addFromFileAcceptList(resolverAvailable);
}

export function addFromFileAcceptList(resolverAvailable) {
  let accept = OFFLINE_FILE_ACCEPT + ',' + mediaFileAcceptList();
  if (resolverAvailable) {
    accept += MIDI_FILE_ACCEPT;
    accept += SHEET_IMAGE_FILE_ACCEPT;
  }
  return accept;
}

export function isSheetImageMimeOrName(fileName, mime) {
  const normalizedMime = String(mime || '').toLowerCase();
  if (normalizedMime === 'image/svg+xml') return false;
  if (normalizedMime.startsWith('image/')) return true;
  if (normalizedMime === 'application/pdf') return true;
  return String(fileName || '').toLowerCase().endsWith('.pdf');
}

export function isSheetImageImportFile(file) {
  if (!file) return false;
  return isSheetImageMimeOrName(file.name, file.type);
}

export const SHEET_IMAGE_RESOLVER_ERROR =
  'Sheet image and PDF import need the media resolver. Log in with an authorized Google account and make sure the resolver is running.';

export async function transcribeSheetImageToResult(file, options) {
  const opts = options || {};
  if (!file) throw new Error('No file selected');
  if (opts.resolverAvailable === false) {
    throw new Error(SHEET_IMAGE_RESOLVER_ERROR);
  }
  return transcribeSheetImageFile({
    file: file,
    accessToken: opts.accessToken,
    titleHints: opts.titleHints,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
}

export function buildSheetDraftFromResult(body, fileName) {
  const draft = buildDraftFromSheetImageResult(body || {});
  const chordDraft = draft.chordDraft;
  return {
    fileName: fileName || '',
    body: body,
    title: (body && body.title) || (chordDraft && chordDraft.title) || '',
    artist: (body && body.artist) || (chordDraft && chordDraft.composer) || '',
    key: (body && body.melody && body.melody.key) || (chordDraft && chordDraft.key) || '',
    meter: (body && body.melody && body.melody.meter) || (chordDraft && chordDraft.meter) || '',
    chordText: (body && body.chordSheet && body.chordSheet.text) || '',
    melodyAbc: (body && body.melody && body.melody.abc) || '',
    warnings: draft.warnings || [],
  };
}

export async function sheetImageFileToCandidates(file, options) {
  const opts = options || {};
  const body = await transcribeSheetImageToResult(file, opts);
  const tune = createTuneFromSheetImageImport({
    result: body,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    book: opts.book,
    titleOverride: opts.titleOverride,
  });
  const candidate = createImportCandidate({
    tune: tune,
    sourceKind: 'sheetimage',
    skipEnrich: true,
  });
  if (file) {
    candidate.pendingFile = {
      name: file.name || 'Sheet image',
      type: file.type || 'image/png',
      blob: file,
      source: 'import',
    };
  }
  return [candidate];
}

export function classifyTextImport(text, fileName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 'empty';
  const lines = trimmed.split(/\r?\n/).filter(function(line) { return line.trim(); });
  if (lines.length === 1 && /^https?:\/\//i.test(lines[0])) return 'url';
  if (/^X:\s*\d/m.test(trimmed)) return 'notation';
  if (isMusicXmlText(trimmed)) return 'notation';
  if (looksLikeBulkListText(trimmed)) return 'bulkList';
  const format = detectTextImportFormat(trimmed, fileName || 'import.txt');
  if (format === 'musicxml' || format === 'chordsheet' || format === 'abc') return 'notation';
  return 'unknown';
}

export function looksLikeBulkListText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (/^X:\s*\d/m.test(trimmed)) return false;
  if (isMusicXmlText(trimmed)) return false;
  const lines = trimmed.split(/\r?\n/).filter(function(line) { return line.trim(); });
  if (lines.length === 0) return false;
  if (lines.length === 1 && /^https?:\/\//i.test(lines[0])) return false;
  let bulkLike = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseBulkLine(lines[i]);
    if (!parsed) continue;
    if (parsed.link || parsed.artist || (parsed.title && !/^[\[\]|A-Ga-gzZ\s:]/m.test(lines[i]))) {
      bulkLike += 1;
    }
  }
  return bulkLike > 0 && bulkLike >= Math.ceil(lines.length * 0.5);
}

export function isNotationImportFile(file) {
  if (!file) return false;
  if (isAudioImportFile(file)) return false;
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return false;
  if (detectScoreFormat(file.name)) return true;
  if (isChordSheetExtension(file.name)) return true;
  const name = String(file.name || '').toLowerCase();
  return ['.abc', '.txt', '.xml', '.musicxml', '.cho', '.pro', '.crd', '.onsong'].some(function(ext) {
    return name.endsWith(ext);
  });
}

export function bulkFileAcceptList() {
  return BULK_TEXT_FILE_ACCEPT + ',' + audioFileAcceptList();
}

const BINARY_IMPORT_EXTENSIONS = ['mxl', 'mid', 'midi'];

function isBinaryImportFileName(fileName) {
  const format = detectScoreFormat(fileName);
  return format === 'mxl' || format === 'midi' || BINARY_IMPORT_EXTENSIONS.some(function(ext) {
    return String(fileName || '').toLowerCase().endsWith('.' + ext);
  });
}

function isBinaryOrSheetImportFileName(fileName, mime) {
  if (isSheetImageMimeOrName(fileName, mime)) return true;
  return isBinaryImportFileName(fileName);
}

export function fileNameFromImportUrl(url) {
  try {
    const parsed = new URL(url);
    const segment = (parsed.pathname || '').split('/').filter(Boolean).pop() || '';
    if (segment) return decodeURIComponent(segment);
  } catch (e) {}
  return 'url-import.txt';
}

async function fetchDriveImportSource(url, driveApi) {
  const fileId = parseDriveFileInput(url);
  if (!fileId) return null;
  if (!driveApi) {
    throw new Error('Google Drive URLs require logging in with Google first.');
  }

  const meta = await new Promise(function(resolve, reject) {
    driveApi.getDocumentMeta(fileId).then(resolve).catch(reject);
  });
  const mime = meta && meta.mimeType ? meta.mimeType : '';
  const fileName = (meta && meta.name) || fileNameFromImportUrl(url) || 'drive-import';

  if (mime.indexOf('google-apps') === -1 && isBinaryOrSheetImportFileName(fileName, mime)) {
    const blob = await fetchDriveFileBlob(driveApi, fileId);
    const file = new File([blob], fileName, { type: blob.type || mime || 'application/octet-stream' });
    return { file: file, fileName: fileName, text: null, sourceUrl: url };
  }

  const text = await fetchDriveFileText(driveApi, fileId);
  return { text: text, fileName: fileName, file: null, sourceUrl: url };
}

export async function fetchImportSourceFromUrl(options) {
  const url = String(options.url || '').trim();
  if (!url) throw new Error('Enter a URL');
  if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');

  const driveSource = await fetchDriveImportSource(url, options.driveApi);
  if (driveSource) return driveSource;

  const fileName = fileNameFromImportUrl(url);
  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new Error('Could not load URL. The site may block browser access (CORS), or the URL may be invalid.');
  }
  if (!response.ok) {
    throw new Error('Could not load URL (HTTP ' + response.status + ').');
  }

  const contentType = response.headers.get('content-type') || '';
  if (isBinaryOrSheetImportFileName(fileName, contentType)) {
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type || contentType || 'application/octet-stream' });
    return { file: file, fileName: fileName, text: null, sourceUrl: url };
  }

  const text = await response.text();
  if (!String(text || '').trim()) {
    throw new Error('URL returned empty content.');
  }
  return { text: text, fileName: fileName, file: null, sourceUrl: url };
}

export async function candidatesFromImportSource(source, options) {
  if (!source) throw new Error('No import source loaded');

  let candidates;
  if (source.file) {
    if (isSheetImageImportFile(source.file)) {
      if (options.resolverAvailable === false) {
        throw new Error(SHEET_IMAGE_RESOLVER_ERROR);
      }
      candidates = await sheetImageFileToCandidates(source.file, options);
    } else {
      candidates = await parseImportFile({
        file: source.file,
        tunebook: options.tunebook,
        abcjsParser: options.abcjsParser,
        book: options.book,
        accessToken: options.accessToken,
        resolverAvailable: options.resolverAvailable !== false,
        onProgress: options.onProgress,
      });
    }
  } else {
    candidates = parseImportText({
      text: source.text,
      fileName: source.fileName,
      tunebook: options.tunebook,
      abcjsParser: options.abcjsParser,
      book: options.book,
    });
  }

  if (source.sourceUrl) {
    candidates.forEach(function(candidate) {
      if (candidate.tune && !candidate.tune.srcUrl) {
        candidate.tune.srcUrl = source.sourceUrl;
      }
    });
  }
  return candidates;
}
