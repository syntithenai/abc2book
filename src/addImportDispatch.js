import { isAudioImportFile } from './audioFileMetadata';
import { bulkLinesToCandidates, driveListTextToBulkLines } from './bulkListFormat';
import { detectScoreFormat } from './scoreImportClient';
import { parseDriveFileInput } from './googleDrivePickerClient';
import {
  candidatesFromImportSource,
  classifyTextImport,
  fetchImportSourceFromUrl,
  isNotationImportFile,
  isSheetImageImportFile,
  parseImportFile,
  parseImportText,
  readFileAsText,
  detectTextImportFormat,
  SHEET_IMAGE_RESOLVER_ERROR,
  sheetImageFileToCandidates,
} from './importSourceParse';

const MIDI_RESOLVER_ERROR =
  'MIDI import needs the media resolver. Log in with an authorized Google account and make sure the resolver is running.';

export function buildImportContext(opts) {
  const token = opts && opts.token;
  return {
    resolverAvailable: !!(opts && opts.resolverAvailable),
    googleLoggedIn: !!(token && token.access_token),
    accessToken: (opts && opts.accessToken) || (token && token.access_token) || '',
    driveApi: (opts && opts.driveApi) || null,
    tunebook: opts && opts.tunebook,
    abcjsParser: opts && opts.abcjsParser,
    book: (opts && opts.book) || '',
    bulkMode: !!(opts && opts.bulkMode),
    bulkTextAppendOnly: !!(opts && opts.bulkTextAppendOnly),
    stayOnForm: !!(opts && opts.stayOnForm),
  };
}

export function normalizeImportInput(input) {
  if (input == null) return { kind: 'empty' };
  if (typeof File !== 'undefined' && input instanceof File) {
    return { kind: 'file', file: input };
  }
  if (typeof input === 'string') {
    return { kind: 'text', text: input, fileName: 'pasted.txt' };
  }
  if (typeof input === 'object') {
    if (input.url && typeof input.url === 'string') {
      return { kind: 'url', url: String(input.url).trim() };
    }
    if (input.file) {
      return {
        kind: 'source',
        source: {
          file: input.file,
          fileName: input.fileName || input.file.name || 'import.bin',
          text: input.text,
          sourceUrl: input.sourceUrl,
        },
      };
    }
    if (input.text !== undefined && input.text !== null) {
      return {
        kind: 'source',
        source: {
          text: String(input.text),
          fileName: input.fileName || 'import.txt',
          sourceUrl: input.sourceUrl,
        },
      };
    }
    if (input.sourceUrl !== undefined || input.fileName !== undefined) {
      return { kind: 'source', source: input };
    }
  }
  return { kind: 'unknown' };
}

export function classifyImportContent(payload, ctx) {
  if (!payload || payload.kind === 'empty') return 'empty';
  if (payload.kind === 'url') return 'url';
  if (payload.kind === 'file') {
    const file = payload.file;
    if (isAudioImportFile(file)) return 'audio';
    if (isSheetImageImportFile(file)) return 'sheetImage';
    if (isNotationImportFile(file) || detectScoreFormat(file.name)) return 'notation';
    return 'unknown';
  }
  if (payload.kind === 'source') {
    const source = payload.source;
    if (source && source.file) {
      return classifyImportContent({ kind: 'file', file: source.file }, ctx);
    }
    if (source && source.text != null) {
      return classifyTextImport(source.text, source.fileName || 'import.txt');
    }
    return 'unknown';
  }
  if (payload.kind === 'text') {
    return classifyTextImport(payload.text, payload.fileName || 'pasted.txt');
  }
  return 'unknown';
}

function importOptionsFromContext(ctx) {
  return {
    tunebook: ctx.tunebook,
    abcjsParser: ctx.abcjsParser,
    book: ctx.book,
    accessToken: ctx.accessToken,
    resolverAvailable: ctx.resolverAvailable,
  };
}

function errorResult(message, flags) {
  return Object.assign({ action: 'error', message: message }, flags || {});
}

async function dispatchFromSource(source, ctx) {
  try {
    const candidates = await candidatesFromImportSource(source, importOptionsFromContext(ctx));
    if (!candidates.length) {
      return errorResult('No tunes found in that import.');
    }
    return { action: 'review', candidates: candidates };
  } catch (e) {
    return errorResult((e && e.message) || 'Import failed.');
  }
}

async function dispatchFromFile(file, ctx) {
  const kind = classifyImportContent({ kind: 'file', file: file }, ctx);

  if (kind === 'audio') {
    return { action: 'audio', files: [file] };
  }

  if (kind === 'sheetImage') {
    if (!ctx.resolverAvailable) {
      return errorResult(SHEET_IMAGE_RESOLVER_ERROR, { needsResolver: true });
    }
    try {
      const candidates = await sheetImageFileToCandidates(file, importOptionsFromContext(ctx));
      return { action: 'review', candidates: candidates };
    } catch (e) {
      return errorResult((e && e.message) || 'Sheet image transcription failed.');
    }
  }

  if (kind === 'notation') {
    if (detectScoreFormat(file.name) === 'midi' && !ctx.resolverAvailable) {
      return errorResult(MIDI_RESOLVER_ERROR, { needsResolver: true });
    }
    return dispatchFromSource({ file: file, fileName: file.name }, ctx);
  }

  try {
    const text = await readFileAsText(file);
    const textKind = classifyTextImport(text, file.name);
    if (textKind === 'url') {
      return dispatchAddImport({ url: text.trim() }, ctx);
    }
    if (textKind === 'notation') {
      const candidates = parseImportText(Object.assign({ text: text, fileName: file.name }, importOptionsFromContext(ctx)));
      if (!candidates.length) return errorResult('No tunes found in that file.');
      return { action: 'review', candidates: candidates };
    }
    if (textKind === 'bulkList') {
      return handleBulkText(text, ctx);
    }
    if (ctx.bulkTextAppendOnly) {
      const formatted = driveListTextToBulkLines(text);
      if (formatted.trim()) {
        return { action: 'bulkAppend', text: formatted };
      }
      if (text.trim()) {
        return { action: 'bulkAppend', text: text.trim() };
      }
    }
    if (ctx.resolverAvailable) {
      try {
        const candidates = await sheetImageFileToCandidates(file, importOptionsFromContext(ctx));
        return { action: 'review', candidates: candidates };
      } catch (inner) {
        return errorResult(inner.message || 'Import failed.');
      }
    }
  } catch (e) {
    if (ctx.resolverAvailable) {
      try {
        const candidates = await sheetImageFileToCandidates(file, importOptionsFromContext(ctx));
        return { action: 'review', candidates: candidates };
      } catch (inner) {
        return errorResult(inner.message || e.message || 'Import failed.');
      }
    }
    return errorResult(e.message || 'Import failed.');
  }

  const hint = ctx.resolverAvailable
    ? 'Unsupported file type. Choose audio, ABC, MusicXML, chord sheet, MIDI, or a sheet image/PDF.'
    : 'Unsupported file type. Choose audio, ABC, MusicXML, chord sheet, or MIDI (when the resolver is available).';
  return errorResult(hint);
}

function handleBulkText(text, ctx) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return errorResult('Nothing to import.');

  const textKind = classifyTextImport(trimmed, 'bulk.txt');
  if (textKind === 'notation') {
    const candidates = parseImportText(Object.assign({ text: trimmed, fileName: 'bulk.txt' }, importOptionsFromContext(ctx)));
    if (!candidates.length) return errorResult('No tunes found in that text.');
    return { action: 'review', candidates: candidates };
  }

  if (ctx.bulkTextAppendOnly) {
    return { action: 'bulkAppend', text: trimmed };
  }

  const lines = trimmed.split(/\r?\n/).filter(function(line) { return line.trim(); });
  const candidates = bulkLinesToCandidates(lines, ctx.tunebook, ctx.book);
  if (!candidates.length) return errorResult('Add at least one line to import.');
  return { action: 'review', candidates: candidates };
}

async function dispatchFromText(text, fileName, ctx) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return errorResult('Nothing to import.');

  const textKind = classifyTextImport(trimmed, fileName || 'pasted.txt');

  if (textKind === 'url') {
    const url = trimmed.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean)[0];
    if (parseDriveFileInput(url) && !ctx.driveApi) {
      return errorResult('Google Drive URLs require logging in with Google first.', { needsGoogleLogin: true });
    }
    try {
      const source = await fetchImportSourceFromUrl({ url: url, driveApi: ctx.driveApi });
      return dispatchFromSource(source, ctx);
    } catch (e) {
      return errorResult(e.message || 'Could not load URL.');
    }
  }

  if (textKind === 'notation') {
    const candidates = parseImportText(Object.assign({ text: trimmed, fileName: fileName || 'pasted.txt' }, importOptionsFromContext(ctx)));
    if (!candidates.length) return errorResult('No tunes found in pasted text.');
    return { action: 'review', candidates: candidates };
  }

  if (textKind === 'bulkList' && (ctx.bulkMode || ctx.bulkTextAppendOnly)) {
    return handleBulkText(trimmed, ctx);
  }

  if (detectTextImportFormat(trimmed, fileName || 'pasted.txt')) {
    const candidates = parseImportText(Object.assign({ text: trimmed, fileName: fileName || 'pasted.txt' }, importOptionsFromContext(ctx)));
    if (candidates.length) {
      return { action: 'review', candidates: candidates };
    }
  }

  if (ctx.bulkMode) {
    return handleBulkText(trimmed, ctx);
  }

  return errorResult('Could not recognize import content. Paste ABC, chord sheet, MusicXML, a URL, or a title list.');
}

export async function dispatchAddImport(input, ctx) {
  const context = buildImportContext(ctx || {});
  const payload = normalizeImportInput(input);

  if (payload.kind === 'empty') {
    return errorResult('Nothing to import.');
  }

  if (payload.kind === 'url') {
    if (parseDriveFileInput(payload.url) && !context.driveApi) {
      return errorResult('Google Drive URLs require logging in with Google first.', { needsGoogleLogin: true });
    }
    try {
      const source = await fetchImportSourceFromUrl({ url: payload.url, driveApi: context.driveApi });
      return dispatchFromSource(source, context);
    } catch (e) {
      return errorResult(e.message || 'Could not load URL.');
    }
  }

  if (payload.kind === 'file') {
    return dispatchFromFile(payload.file, context);
  }

  if (payload.kind === 'source') {
    return dispatchFromSource(payload.source, context);
  }

  if (payload.kind === 'text') {
    return dispatchFromText(payload.text, payload.fileName, context);
  }

  return errorResult('Unsupported import input.');
}
