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
import { classifyImportOutcome } from './importIntakePolicy';
import { isChordSheetZipArchive, chordSheetZipToCandidates } from './importArchiveParser';
import { isMsczFile, msczFileToCandidates } from './msczExtract';
import { isSbpFile, sbpFileToCandidates } from './sbpParse';
import { isOnsongArchiveFile, onsongArchiveFileToCandidates } from './onsongArchiveParse';
import { isIRealProHtmlFile, irealProFileToCandidates } from './irealProParse';
import { isVideoImportFile } from './audioFileMetadata';
import {
  buildBatchSummaryFromClassifier,
  classifyAbcTextForReview,
  shouldShowAbcBatchSummary,
} from './importAbcClassifier';

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
    tunes: (opts && opts.tunes) || {},
    bulkMode: !!(opts && opts.bulkMode),
    bulkTextAppendOnly: !!(opts && opts.bulkTextAppendOnly),
    stayOnForm: !!(opts && opts.stayOnForm),
    maxCandidates: opts && opts.maxCandidates != null ? opts.maxCandidates : null,
    entryPoint: (opts && opts.entryPoint) || null,
    currentTuneId: (opts && opts.currentTuneId) || null,
    midiMode: (opts && opts.midiMode) || null,
    midiStrategy: (opts && opts.midiStrategy) || 'auto',
    includeChords: opts && opts.includeChords !== undefined ? opts.includeChords : null,
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
    if (isVideoImportFile(file)) return 'video';
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
    midiMode: ctx.midiMode || null,
    midiStrategy: ctx.midiStrategy || 'auto',
    includeChords: ctx.includeChords !== undefined ? ctx.includeChords : null,
  };
}

function errorResult(message, flags) {
  return Object.assign({ action: 'error', message: message }, flags || {});
}

function reviewCandidates(candidates, ctx) {
  const classified = classifyImportOutcome(candidates, ctx);
  if (!classified.candidates.length) {
    return errorResult('No tunes found in that import.');
  }
  return {
    action: 'review',
    candidates: classified.candidates,
    bulkReviewRequired: classified.bulkReviewRequired,
    candidateCount: classified.candidateCount,
  };
}

/**
 * ABC text: classify by id/hash (+ library fuzzy for inserts) so bulk can batch-apply.
 */
function reviewAbcText(abcText, ctx) {
  if (!ctx.tunebook || typeof ctx.tunebook.importAbc !== 'function') {
    const candidates = parseImportText(Object.assign({
      text: abcText,
      fileName: 'import.abc',
    }, importOptionsFromContext(ctx)));
    return reviewCandidates(candidates, ctx);
  }
  try {
    const classified = classifyAbcTextForReview(ctx.tunebook, abcText, {
      forceBook: ctx.book || null,
      tunes: ctx.tunes || {},
      includeSkipped: false,
    });
    if (!classified.candidates.length && !(classified.summary && classified.summary.deletes)) {
      return errorResult('No tunes found in that import.');
    }
    const batchSummary = buildBatchSummaryFromClassifier(classified);
    if (shouldShowAbcBatchSummary(classified)) {
      return {
        action: 'batch',
        batchSummary: batchSummary,
        candidates: classified.candidates,
        candidateCount: classified.candidates.length,
        bulkReviewRequired: true,
      };
    }
    return reviewCandidates(classified.candidates, ctx);
  } catch (e) {
    return errorResult((e && e.message) || 'Could not classify ABC import.');
  }
}

function isAbcNotationText(text, fileName) {
  const format = detectTextImportFormat(text, fileName);
  return format === 'abc';
}

async function dispatchFromSource(source, ctx) {
  try {
    if (source && source.text != null && !source.file
      && isAbcNotationText(source.text, source.fileName || 'import.abc')) {
      return reviewAbcText(source.text, ctx);
    }
    if (source && source.file
      && (detectScoreFormat(source.file.name) === 'abc' || /\.abc$/i.test(source.file.name || ''))) {
      const text = await readFileAsText(source.file);
      return reviewAbcText(text, ctx);
    }
    const candidates = await candidatesFromImportSource(source, importOptionsFromContext(ctx));
    return reviewCandidates(candidates, ctx);
  } catch (e) {
    return errorResult((e && e.message) || 'Import failed.');
  }
}

async function dispatchFromFile(file, ctx) {
  if (isSbpFile(file)) {
    try {
      const candidates = await sbpFileToCandidates(file, importOptionsFromContext(ctx));
      return reviewCandidates(candidates, ctx);
    } catch (e) {
      return errorResult((e && e.message) || 'Could not read Songbook Pro file.');
    }
  }

  if (isMsczFile(file)) {
    try {
      const candidates = await msczFileToCandidates(file, importOptionsFromContext(ctx));
      return reviewCandidates(candidates, ctx);
    } catch (e) {
      return errorResult((e && e.message) || 'Could not read MuseScore file.');
    }
  }

  if (isOnsongArchiveFile(file)) {
    try {
      const candidates = await onsongArchiveFileToCandidates(file, importOptionsFromContext(ctx));
      return reviewCandidates(candidates, ctx);
    } catch (e) {
      return errorResult((e && e.message) || 'Could not read OnSong archive.');
    }
  }

  if (isIRealProHtmlFile(file)) {
    try {
      const text = await readFileAsText(file);
      const { looksLikeIRealProHtml } = await import('./irealProParse');
      if (looksLikeIRealProHtml(text) || /ireal/i.test(file.name || '')) {
        const candidates = await irealProFileToCandidates(file, importOptionsFromContext(ctx));
        return reviewCandidates(candidates, ctx);
      }
    } catch (e) {
      // Fall through to normal text/html handling
      if (e && /iReal Pro/i.test(e.message || '')) {
        return errorResult(e.message);
      }
    }
  }

  if (isChordSheetZipArchive(file)) {
    try {
      const candidates = await chordSheetZipToCandidates(file, importOptionsFromContext(ctx));
      return reviewCandidates(candidates, ctx);
    } catch (e) {
      return errorResult((e && e.message) || 'Could not read ZIP archive.');
    }
  }

  const kind = classifyImportContent({ kind: 'file', file: file }, ctx);

  if (kind === 'audio' || kind === 'video') {
    return { action: kind === 'video' ? 'video' : 'audio', files: [file] };
  }

  if (kind === 'sheetImage') {
    if (!ctx.resolverAvailable) {
      return errorResult(SHEET_IMAGE_RESOLVER_ERROR, { needsResolver: true });
    }
    try {
      const candidates = await sheetImageFileToCandidates(file, importOptionsFromContext(ctx));
      return reviewCandidates(candidates, ctx);
    } catch (e) {
      return errorResult((e && e.message) || 'Sheet image transcription failed.');
    }
  }

  if (kind === 'notation') {
    if (detectScoreFormat(file.name) === 'midi' && !ctx.resolverAvailable) {
      return errorResult(MIDI_RESOLVER_ERROR, { needsResolver: true });
    }
    if (detectScoreFormat(file.name) === 'abc' || /\.abc$/i.test(file.name || '')) {
      try {
        const text = await readFileAsText(file);
        return reviewAbcText(text, ctx);
      } catch (e) {
        return errorResult((e && e.message) || 'Could not read ABC file.');
      }
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
      if (isAbcNotationText(text, file.name)) {
        return reviewAbcText(text, ctx);
      }
      const candidates = parseImportText(Object.assign({ text: text, fileName: file.name }, importOptionsFromContext(ctx)));
      return reviewCandidates(candidates, ctx);
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
        return reviewCandidates(candidates, ctx);
      } catch (inner) {
        return errorResult(inner.message || 'Import failed.');
      }
    }
  } catch (e) {
    if (ctx.resolverAvailable) {
      try {
        const candidates = await sheetImageFileToCandidates(file, importOptionsFromContext(ctx));
        return reviewCandidates(candidates, ctx);
      } catch (inner) {
        return errorResult(inner.message || e.message || 'Import failed.');
      }
    }
    return errorResult(e.message || 'Import failed.');
  }

  const hint = ctx.resolverAvailable
    ? 'Unsupported file type. Choose audio, video, ABC, MusicXML, MuseScore, chord sheet, ZIP, Songbook Pro, OnSong, iReal Pro, MIDI, or a sheet image/PDF.'
    : 'Unsupported file type. Choose audio, video, ABC, MusicXML, MuseScore, chord sheet, ZIP, Songbook Pro, OnSong, iReal Pro, or MIDI (when the resolver is available).';
  return errorResult(hint);
}

function handleBulkText(text, ctx) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return errorResult('Nothing to import.');

  const textKind = classifyTextImport(trimmed, 'bulk.txt');
  if (textKind === 'notation') {
    if (isAbcNotationText(trimmed, 'bulk.txt')) {
      return reviewAbcText(trimmed, ctx);
    }
    const candidates = parseImportText(Object.assign({ text: trimmed, fileName: 'bulk.txt' }, importOptionsFromContext(ctx)));
    return reviewCandidates(candidates, ctx);
  }

  if (ctx.bulkTextAppendOnly) {
    return { action: 'bulkAppend', text: trimmed };
  }

  const lines = trimmed.split(/\r?\n/).filter(function(line) { return line.trim(); });
  const candidates = bulkLinesToCandidates(lines, ctx.tunebook, ctx.book);
  if (!candidates.length) return errorResult('Add at least one line to import.');
  return reviewCandidates(candidates, ctx);
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
    if (isAbcNotationText(trimmed, fileName || 'pasted.txt')) {
      return reviewAbcText(trimmed, ctx);
    }
    const candidates = parseImportText(Object.assign({ text: trimmed, fileName: fileName || 'pasted.txt' }, importOptionsFromContext(ctx)));
    return reviewCandidates(candidates, ctx);
  }

  if (textKind === 'bulkList' && (ctx.bulkMode || ctx.bulkTextAppendOnly)) {
    return handleBulkText(trimmed, ctx);
  }

  if (detectTextImportFormat(trimmed, fileName || 'pasted.txt')) {
    if (isAbcNotationText(trimmed, fileName || 'pasted.txt')) {
      return reviewAbcText(trimmed, ctx);
    }
    const candidates = parseImportText(Object.assign({ text: trimmed, fileName: fileName || 'pasted.txt' }, importOptionsFromContext(ctx)));
    if (candidates.length) {
      return reviewCandidates(candidates, ctx);
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
