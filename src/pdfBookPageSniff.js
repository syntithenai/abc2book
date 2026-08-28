/**
 * Sniff PDF pages before rasterize: text layer density, chord/lyric likelihood,
 * staff-like ink, and embedded MusicXML/MXL/ABC (attachments, annotations, raw streams).
 */
import { inflateSync } from 'fflate';
import { pdfjs } from './pdfJsConfig';
import { isChordLine, tokenIsChord } from './chordSheetUtils';

export const PDF_PAGE_KINDS = {
  SCANNED_IMAGE: 'scanned_image',
  VECTOR_NOTATION: 'vector_notation',
  TEXT_CHORD: 'text_chord',
  TEXT_LYRICS: 'text_lyrics',
  EMBEDDED_SCORE: 'embedded_score',
  MIXED: 'mixed',
};

const MUSICXML_RE = /\.(musicxml|xml)$/i;
const MXL_RE = /\.mxl$/i;
const ABC_RE = /\.abc$/i;
const SCORE_NAME_RE = /\(([^()]{1,180}\.(?:musicxml|mxl|abc|xml))\)/gi;
const FILEATTACHMENT_TYPE = 17;

function strip(text) {
  return String(text || '').replace(/[\x00-\x1f\x7f]/g, '').trim();
}

function bytesKey(kind, bytes) {
  const len = bytes && bytes.length ? bytes.length : 0;
  let h = 0;
  const n = Math.min(len, 64);
  for (let i = 0; i < n; i += 1) {
    h = ((h << 5) - h) + bytes[i];
    h |= 0;
  }
  return String(kind || '') + ':' + len + ':' + (h >>> 0).toString(16);
}

export function scoreFilenameKind(filename) {
  const name = String(filename || '');
  if (MXL_RE.test(name)) return 'mxl';
  if (MUSICXML_RE.test(name)) return 'musicxml';
  if (ABC_RE.test(name)) return 'abc';
  return '';
}

export function detectScoreBytesKind(bytes) {
  if (!bytes || !bytes.length) return '';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'mxl';
  let text = '';
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i += 1) {
    text += String.fromCharCode(bytes[i]);
  }
  if (/<\?xml|<!DOCTYPE\s+score|<score-partwise|<score-timewise/i.test(text)) {
    return 'musicxml';
  }
  if (/^X:\s*\d+/m.test(text) && /\nK:/m.test(text)) return 'abc';
  return '';
}

function toUint8(content) {
  if (!content) return null;
  if (content instanceof Uint8Array) return content;
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return null;
}

export function pushScoreEmbed(embeds, seen, entry) {
  const list = embeds || [];
  const map = seen || new Set();
  const filename = String((entry && entry.filename) || '').trim() || 'embedded';
  const bytes = toUint8(entry && entry.bytes);
  if (!bytes || !bytes.length) return list;
  let kind = String((entry && entry.kind) || '') || scoreFilenameKind(filename) || detectScoreBytesKind(bytes);
  if (!kind) return list;
  // Bare .xml only when content looks like MusicXML
  if (kind === 'musicxml' && /\.xml$/i.test(filename) && !/\.musicxml$/i.test(filename)) {
    if (detectScoreBytesKind(bytes) !== 'musicxml') return list;
  }
  const key = bytesKey(kind, bytes);
  if (map.has(key)) return list;
  map.add(key);
  list.push({
    filename: filename,
    kind: kind,
    bytes: bytes,
  });
  return list;
}

export function collectEmbedsFromAttachmentMap(attachments) {
  const embeds = [];
  const seen = new Set();
  Object.keys(attachments || {}).forEach(function(name) {
    const entry = attachments[name];
    const filename = String((entry && (entry.filename || name)) || name);
    pushScoreEmbed(embeds, seen, {
      filename: filename,
      bytes: entry && (entry.content || entry.data),
      kind: scoreFilenameKind(filename),
    });
  });
  return embeds;
}

/**
 * Collect FileAttachment annotation payloads (pdf.js page.getAnnotations()).
 */
export function collectEmbedsFromAnnotations(annotations) {
  const embeds = [];
  const seen = new Set();
  (annotations || []).forEach(function(ann) {
    if (!ann) return;
    const subtype = String(ann.subtype || ann.annotationType || '');
    const isFile = (
      subtype === 'FileAttachment'
      || Number(ann.annotationType) === FILEATTACHMENT_TYPE
      || (ann.file && (ann.file.filename || ann.file.content))
    );
    if (!isFile) return;
    const file = ann.file || {};
    const filename = String(file.filename || ann.filename || 'attachment');
    pushScoreEmbed(embeds, seen, {
      filename: filename,
      bytes: file.content || file.data || ann.content,
      kind: scoreFilenameKind(filename),
    });
  });
  return embeds;
}

function latin1FromBytes(u8) {
  const parts = [];
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    const slice = u8.subarray(i, Math.min(i + chunk, u8.length));
    parts.push(String.fromCharCode.apply(null, slice));
  }
  return parts.join('');
}

function tryInflateStream(bytes) {
  try {
    return inflateSync(bytes);
  } catch (e) {
    return null;
  }
}

/**
 * Last-resort raw parse: pull EmbeddedFile / uncompressed streams that look like scores.
 */
export function collectEmbedsFromPdfBytes(pdfBytes) {
  const embeds = [];
  const seen = new Set();
  const u8 = toUint8(pdfBytes);
  if (!u8 || u8.length < 32) return embeds;
  const text = latin1FromBytes(u8);
  const names = [];
  SCORE_NAME_RE.lastIndex = 0;
  let nameMatch;
  while ((nameMatch = SCORE_NAME_RE.exec(text))) {
    names.push(nameMatch[1]);
  }
  let nameIndex = 0;
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(text))) {
    const dictStart = text.lastIndexOf('<<', match.index);
    const dict = dictStart >= 0 ? text.slice(dictStart, match.index) : '';
    const rawStr = match[1];
    const rawBytes = new Uint8Array(rawStr.length);
    for (let i = 0; i < rawStr.length; i += 1) {
      rawBytes[i] = rawStr.charCodeAt(i) & 0xff;
    }
    let content = rawBytes;
    if (/\/Filter\s*\/FlateDecode/i.test(dict) || /\/Filter\s*\[\s*\/FlateDecode/i.test(dict)) {
      const inflated = tryInflateStream(rawBytes);
      if (!inflated) continue;
      content = inflated;
    }
    const kind = detectScoreBytesKind(content);
    if (!kind) continue;
    const isEmbedDict = /\/Type\s*\/EmbeddedFile/i.test(dict) || /\/Subtype\s*\/EmbeddedFile/i.test(dict);
    // Prefer EmbeddedFile dicts; also accept clear score payloads (MusicXML/ABC/MXL)
    if (!isEmbedDict && kind === 'musicxml' && content.length < 80) continue;
    let filename = names[nameIndex] || ('embedded-' + (embeds.length + 1) + '.' + (kind === 'musicxml' ? 'musicxml' : kind));
    if (names[nameIndex] && scoreFilenameKind(names[nameIndex])) {
      nameIndex += 1;
    }
    if (kind === 'mxl' && !/\.mxl$/i.test(filename)) filename = filename.replace(/\.[^.]+$/, '') + '.mxl';
    pushScoreEmbed(embeds, seen, { filename: filename, kind: kind, bytes: content });
  }
  return embeds;
}

async function collectEmbeddedScores(doc, pdfBytes) {
  const embeds = [];
  const seen = new Set();

  function merge(list) {
    (list || []).forEach(function(item) {
      pushScoreEmbed(embeds, seen, item);
    });
  }

  try {
    if (doc && typeof doc.getAttachments === 'function') {
      merge(collectEmbedsFromAttachmentMap(await doc.getAttachments()));
    }
  } catch (e) {
    // ignore
  }

  try {
    const numPages = doc && doc.numPages ? doc.numPages : 0;
    for (let p = 1; p <= numPages; p += 1) {
      const page = await doc.getPage(p);
      if (typeof page.getAnnotations === 'function') {
        merge(collectEmbedsFromAnnotations(await page.getAnnotations()));
      }
    }
  } catch (e) {
    // ignore annotation probe failures
  }

  try {
    merge(collectEmbedsFromPdfBytes(pdfBytes));
  } catch (e) {
    // ignore raw parse failures
  }

  return embeds;
}

function clusterTextItems(items) {
  const rows = [];
  const ordered = (items || []).slice().sort(function(a, b) {
    const ta = (a.transform && a.transform[5]) || 0;
    const tb = (b.transform && b.transform[5]) || 0;
    if (Math.abs(tb - ta) > 4) return tb - ta;
    const xa = (a.transform && a.transform[4]) || 0;
    const xb = (b.transform && b.transform[4]) || 0;
    return xa - xb;
  });
  ordered.forEach(function(item) {
    const text = strip(item && item.str);
    if (!text) return;
    const y = (item.transform && item.transform[5]) || 0;
    const x = (item.transform && item.transform[4]) || 0;
    if (!rows.length || Math.abs(rows[rows.length - 1].y - y) > 6) {
      rows.push({ y: y, x: x, parts: [text] });
    } else {
      rows[rows.length - 1].parts.push(text);
    }
  });
  return rows.map(function(row) {
    return row.parts.join(' ').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}

function scoreTextKind(lines) {
  const list = Array.isArray(lines) ? lines : [];
  let chordLines = 0;
  let lyricLines = 0;
  let chordTokens = 0;
  let wordTokens = 0;
  let chordProHints = 0;
  list.forEach(function(line) {
    const text = strip(line);
    if (!text) return;
    if (/\{(?:title|artist|composer|key|capo|soc|eoc|sov|eov)/i.test(text) || /\[[A-G][#b]?[^\]]*\]/.test(text)) {
      chordProHints += 1;
    }
    if (isChordLine(text)) {
      chordLines += 1;
      text.split(/\s+/).forEach(function(tok) {
        if (tokenIsChord(tok)) chordTokens += 1;
        else if (tok.length > 1) wordTokens += 1;
      });
      return;
    }
    if (text.length >= 12) lyricLines += 1;
    text.split(/\s+/).forEach(function(tok) {
      if (tokenIsChord(tok)) chordTokens += 1;
      else if (/[A-Za-z]{2,}/.test(tok)) wordTokens += 1;
    });
  });
  const tokenTotal = Math.max(1, chordTokens + wordTokens);
  const chordDensity = chordTokens / tokenTotal;
  return {
    chordLines: chordLines,
    lyricLines: lyricLines,
    chordDensity: chordDensity,
    chordProHints: chordProHints,
    lineCount: list.filter(Boolean).length,
  };
}

/**
 * Cheap staff-line detector from ImageData (or { data, width, height }).
 * Looks for thin dark horizontal runs with regular vertical spacing (~staff).
 */
export function estimateStaffLikeInk(imageData) {
  const img = imageData || {};
  const width = Number(img.width) || 0;
  const height = Number(img.height) || 0;
  const data = img.data;
  if (!width || !height || !data || data.length < width * height * 4) {
    return { score: 0, hasStaffLikeInk: false, peakCount: 0, staffGroups: 0 };
  }

  const rowDark = new Float32Array(height);
  const stepX = Math.max(1, Math.floor(width / 160));
  for (let y = 0; y < height; y += 1) {
    let dark = 0;
    let samples = 0;
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (g < 150) dark += 1;
      samples += 1;
    }
    rowDark[y] = samples ? dark / samples : 0;
  }

  const peaks = [];
  for (let y = 2; y < height - 2; y += 1) {
    const v = rowDark[y];
    if (v < 0.28) continue;
    if (v < rowDark[y - 1] || v < rowDark[y + 1]) continue;
    // Prefer thin lines: darkness drops within a few rows
    const side = Math.max(rowDark[y - 2], rowDark[y + 2]);
    if (v < side * 1.15 && v < 0.55) continue;
    peaks.push(y);
  }

  // Deduplicate peaks within 2px
  const thinPeaks = [];
  peaks.forEach(function(y) {
    if (!thinPeaks.length || y - thinPeaks[thinPeaks.length - 1] > 2) {
      thinPeaks.push(y);
    }
  });

  let staffGroups = 0;
  for (let i = 0; i + 4 < thinPeaks.length; i += 1) {
    const gaps = [];
    for (let k = 0; k < 4; k += 1) {
      gaps.push(thinPeaks[i + k + 1] - thinPeaks[i + k]);
    }
    const mean = (gaps[0] + gaps[1] + gaps[2] + gaps[3]) / 4;
    if (mean < 2 || mean > Math.max(8, height * 0.08)) continue;
    let ok = true;
    for (let k = 0; k < 4; k += 1) {
      if (Math.abs(gaps[k] - mean) > mean * 0.45 + 1.5) {
        ok = false;
        break;
      }
    }
    if (ok) {
      staffGroups += 1;
      i += 4;
    }
  }

  const score = Math.min(1, staffGroups * 0.35 + Math.min(thinPeaks.length, 20) * 0.02);
  return {
    score: score,
    hasStaffLikeInk: staffGroups >= 1 || (thinPeaks.length >= 10 && score >= 0.25),
    peakCount: thinPeaks.length,
    staffGroups: staffGroups,
  };
}

/**
 * Build synthetic ImageData-like buffer with horizontal staff lines (tests / demos).
 */
export function makeSyntheticStaffImageData(options) {
  const opts = options || {};
  const width = opts.width || 120;
  const height = opts.height || 160;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const staves = opts.staves || [{ top: 30, gap: 4 }];
  staves.forEach(function(staff) {
    for (let line = 0; line < 5; line += 1) {
      const y = staff.top + line * staff.gap;
      if (y < 0 || y >= height) continue;
      for (let x = 4; x < width - 4; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = 20;
        data[i + 1] = 20;
        data[i + 2] = 20;
      }
    }
  });
  return { data: data, width: width, height: height };
}

async function probePageStaffLikeInk(page) {
  try {
    if (typeof document === 'undefined' || !document.createElement) {
      return { score: 0, hasStaffLikeInk: false, peakCount: 0, staffGroups: 0 };
    }
    const viewport = page.getViewport({ scale: 0.22 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { score: 0, hasStaffLikeInk: false, peakCount: 0, staffGroups: 0 };
    }
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    return estimateStaffLikeInk(imageData);
  } catch (e) {
    return { score: 0, hasStaffLikeInk: false, peakCount: 0, staffGroups: 0 };
  }
}

/**
 * Classify one PDF page from text-layer + optional staff-ink signals (no full rasterize).
 */
export function classifyPdfPageKind(signals) {
  const s = signals || {};
  // Doc-level embeds are handled as separate synthetic pages; only force this
  // when the caller explicitly marks the page as embed-only.
  if (s.hasEmbeddedScore && s.embedOnlyPage) return PDF_PAGE_KINDS.EMBEDDED_SCORE;
  const textLen = Number(s.textCharCount) || 0;
  const scores = s.textScores || {};
  const staff = !!(s.hasStaffLikeInk || (s.staffInk && s.staffInk.hasStaffLikeInk));
  if (textLen < 40) return PDF_PAGE_KINDS.SCANNED_IMAGE;

  const chordish = (
    scores.chordProHints >= 1
    || scores.chordLines >= 2
    || scores.chordDensity >= 0.18
  );
  if (chordish && staff) return PDF_PAGE_KINDS.MIXED;
  if (chordish) return PDF_PAGE_KINDS.TEXT_CHORD;

  const lyricsish = (
    scores.lyricLines >= 4
    && scores.chordLines === 0
    && scores.chordDensity < 0.08
  );
  if (lyricsish && !staff) return PDF_PAGE_KINDS.TEXT_LYRICS;
  if (lyricsish && staff) return PDF_PAGE_KINDS.VECTOR_NOTATION;

  if (staff && textLen >= 40) return PDF_PAGE_KINDS.VECTOR_NOTATION;

  if (textLen >= 80 && scores.lineCount >= 3 && scores.chordDensity < 0.05) {
    return PDF_PAGE_KINDS.VECTOR_NOTATION;
  }
  if (scores.chordLines >= 1 && scores.lyricLines >= 2) return PDF_PAGE_KINDS.MIXED;
  if (textLen >= 40) return PDF_PAGE_KINDS.VECTOR_NOTATION;
  return PDF_PAGE_KINDS.SCANNED_IMAGE;
}

export function needsRasterizeForPageKind(pageKind) {
  const kind = String(pageKind || '');
  return (
    kind === PDF_PAGE_KINDS.SCANNED_IMAGE
    || kind === PDF_PAGE_KINDS.VECTOR_NOTATION
    || kind === PDF_PAGE_KINDS.MIXED
    || !kind
  );
}

export function chooseRasterScale(viewportHeight) {
  const h = Number(viewportHeight) || 0;
  if (h > 0 && h < 1200) return 2.75;
  return 2;
}

function shouldProbeStaffInk(textLen, textScores) {
  if (textLen < 40) return false;
  const scores = textScores || {};
  // Clear ChordPro / dense chord pages: skip the render probe.
  if (scores.chordProHints >= 1 || scores.chordDensity >= 0.22) return false;
  return true;
}

/**
 * Sniff an entire PDF once: per-page kind + text lines + embeds.
 */
export async function sniffPdfBook(file, options) {
  const opts = options || {};
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: data }).promise;
  const embeds = await collectEmbeddedScores(doc, data);
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (opts.signal && opts.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const lines = clusterTextItems(textContent.items || []);
      const joined = lines.join('\n');
      const textScores = scoreTextKind(lines);
      let staffInk = { score: 0, hasStaffLikeInk: false, peakCount: 0, staffGroups: 0 };
      if (shouldProbeStaffInk(joined.length, textScores) && opts.skipStaffProbe !== true) {
        staffInk = await probePageStaffLikeInk(page);
      }
      const pageKind = classifyPdfPageKind({
        textCharCount: joined.length,
        textScores: textScores,
        hasStaffLikeInk: staffInk.hasStaffLikeInk,
        staffInk: staffInk,
      });
      pages.push({
        page: pageNumber,
        pageKind: pageKind,
        lines: lines,
        textScores: textScores,
        textCharCount: joined.length,
        staffInk: staffInk,
        width: viewport.width,
        height: viewport.height,
        suggestedScale: chooseRasterScale(viewport.height),
      });
      if (typeof opts.onPage === 'function') {
        opts.onPage(pageNumber, doc.numPages);
      }
    }
  } finally {
    try {
      if (doc && typeof doc.destroy === 'function') await doc.destroy();
    } catch (e) {
      // ignore
    }
  }
  return {
    numPages: pages.length,
    pages: pages,
    embeds: embeds,
    sourceName: (file && file.name) || '',
  };
}

/**
 * Split text-layer lines into song blocks by blank lines / section headers / title-ish lines.
 */
export function splitTextLayerIntoSongs(lines, pageKind) {
  const list = Array.isArray(lines) ? lines : [];
  const songs = [];
  let current = { title: '', lines: [] };
  const TITLE_RE = /^.{3,80}$/;

  function flush() {
    const body = current.lines.filter(function(l) { return strip(l); });
    if (!body.length && !current.title) return;
    songs.push({
      title: current.title || (body[0] || 'Untitled').slice(0, 80),
      lines: body,
      text: body.join('\n'),
      pageKind: pageKind || PDF_PAGE_KINDS.TEXT_CHORD,
    });
    current = { title: '', lines: [] };
  }

  list.forEach(function(raw, index) {
    const line = strip(raw);
    if (!line) {
      if (current.lines.length) flush();
      return;
    }
    const wordCount = line.split(/\s+/).filter(Boolean).length;
    const hasKeyHint = /\([A-G][#b]?(?:m|maj|min|dim|aug)?(?:\d)?(?:\/[A-G][#b]?)?\)\s*$/i.test(line);
    // Mid-page titles: short heading, or title with trailing key hint like "(Am)"
    const looksTitle = (
      index === 0
      || (
        /^[A-Z0-9].{2,60}$/.test(line)
        && !isChordLine(line)
        && (wordCount <= 6 || hasKeyHint)
      )
    ) && TITLE_RE.test(line) && !/^verse|chorus|bridge|intro|outro/i.test(line);
    if (looksTitle && current.lines.length >= 2) {
      flush();
      current.title = line;
      return;
    }
    if (!current.title && looksTitle && !isChordLine(line)) {
      current.title = line;
      return;
    }
    current.lines.push(line);
  });
  flush();
  return songs.length ? songs : [{
    title: 'Untitled',
    lines: list,
    text: list.join('\n'),
    pageKind: pageKind || PDF_PAGE_KINDS.TEXT_LYRICS,
  }];
}
