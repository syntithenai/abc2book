import { inferSectionTypesFromLineCounts, isSectionHeader, normalizeLyricBlocks, normalizeSectionType, normalizeStanzaNameKey } from './chordSheetUtils';

/**
 * Normalize lyric/section lines into typed blocks.
 * Blank lines flush blocks; section headers start blocks.
 * When no headers exist, may infer verse/chorus/bridge from alternating line counts.
 *
 * @returns {Array<{ type: string|null, header: string, lines: string[] }>}
 */
export function normalizeLyricStructure(lines) {
  const blocks = normalizeLyricBlocks(lines).map(function(block) {
    const source = Array.isArray(block) ? block : [];
    let header = '';
    let body = source;
    if (source.length > 0 && isSectionHeader(source[0])) {
      header = String(source[0]).trim();
      body = source.slice(1);
    }
    return {
      type: header ? normalizeSectionType(header) : null,
      header: header,
      lines: body.map(function(line) { return String(line == null ? '' : line); }),
    };
  });
  inferSectionTypesFromLineCounts(blocks);
  return blocks;
}

function toLyricLines(textOrLines) {
  if (Array.isArray(textOrLines)) return textOrLines;
  return String(textOrLines == null ? '' : textOrLines).split(/\r?\n/);
}

/**
 * Human-readable title for a lyric section in navigation UI.
 */
export function sectionDisplayTitle(section) {
  const header = section && section.header ? String(section.header).trim() : '';
  if (header) {
    const cleaned = header
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/^#+\s*/, '')
      .replace(/^[-–—−•*]\s*/, '')
      .trim();
    return cleaned || header;
  }
  const body = section && Array.isArray(section.lines) ? section.lines : [];
  const first = body.map(function(line) { return String(line || '').trim(); }).find(Boolean);
  if (first) {
    return first.length > 40 ? first.slice(0, 37) + '…' : first;
  }
  return 'Untitled section';
}

/**
 * Like normalizeLyricStructure, plus startLine (0-based) in the original lines
 * and a display title for navigation UI.
 *
 * @returns {Array<{ type: string|null, header: string, lines: string[], startLine: number, title: string }>}
 */
export function listLyricSections(textOrLines) {
  const source = toLyricLines(textOrLines);
  const sections = normalizeLyricStructure(source);
  let cursor = 0;
  return sections.map(function(section) {
    let startLine = cursor;
    let headerInSource = false;
    if (section.header) {
      const headerNeedle = String(section.header).trim();
      for (let i = cursor; i < source.length; i++) {
        if (String(source[i] == null ? '' : source[i]).trim() === headerNeedle) {
          startLine = i;
          headerInSource = true;
          break;
        }
      }
    }
    if (!headerInSource) {
      const bodyNeedle = section.lines.length > 0 ? String(section.lines[0]) : null;
      if (bodyNeedle != null) {
        for (let i = cursor; i < source.length; i++) {
          if (String(source[i] == null ? '' : source[i]) === bodyNeedle) {
            startLine = i;
            break;
          }
        }
      }
    }

    let endLine = startLine;
    if (headerInSource) {
      endLine = startLine + 1;
      let bodyIndex = 0;
      while (bodyIndex < section.lines.length && endLine < source.length) {
        if (String(source[endLine] == null ? '' : source[endLine]).trim().length === 0) {
          endLine += 1;
          continue;
        }
        endLine += 1;
        bodyIndex += 1;
      }
    } else {
      endLine = startLine + section.lines.length;
    }
    cursor = endLine;
    while (cursor < source.length && String(source[cursor] == null ? '' : source[cursor]).trim() === '') {
      cursor += 1;
    }

    return {
      type: section.type,
      header: section.header,
      lines: section.lines,
      startLine: startLine,
      title: sectionDisplayTitle(section),
    };
  });
}

/**
 * Serialize typed lyric sections back to multiline text (blank line between sections).
 */
export function serializeLyricStructure(sections) {
  const blocks = [];
  (Array.isArray(sections) ? sections : []).forEach(function(section) {
    const parts = [];
    if (section && section.header) parts.push(String(section.header));
    const body = section && Array.isArray(section.lines) ? section.lines : [];
    body.forEach(function(line) { parts.push(String(line == null ? '' : line)); });
    if (parts.length > 0) blocks.push(parts.join('\n'));
  });
  return blocks.join('\n\n');
}

/**
 * Reorder lyric sections by moving fromIndex to an insert-before slot.
 * toIndex is the destination index in the original list (0..length), meaning
 * "insert before that index" (length means append at the end).
 * Returns the new multiline text (or the original text if the move is a no-op).
 */
export function reorderLyricSections(textOrLines, fromIndex, toIndex) {
  const lines = toLyricLines(textOrLines);
  const sections = listLyricSections(lines);
  const from = Number(fromIndex);
  let insertBefore = Number(toIndex);
  if (
    !Number.isFinite(from)
    || !Number.isFinite(insertBefore)
    || from < 0
    || from >= sections.length
    || insertBefore < 0
    || insertBefore > sections.length
  ) {
    return lines.join('\n');
  }
  // Dropping onto itself or immediately after itself leaves order unchanged.
  if (insertBefore === from || insertBefore === from + 1) {
    return lines.join('\n');
  }
  const next = sections.slice();
  const moved = next.splice(from, 1)[0];
  if (insertBefore > from) insertBefore -= 1;
  next.splice(insertBefore, 0, moved);
  return serializeLyricStructure(next);
}

/**
 * Format a user-entered section name as a lyrics header line.
 * Preserves bracketed or markdown headers; otherwise wraps as [Name].
 */
export function formatLyricSectionHeader(name) {
  const trimmed = String(name == null ? '' : name).trim();
  if (!trimmed) return '';
  if (/^\[.+\]$/.test(trimmed)) return trimmed;
  if (/^#+\s+\S/.test(trimmed)) return trimmed;
  return '[' + trimmed + ']';
}

/**
 * Rewrite a matching lyric section header line when a chord section is renamed.
 * @returns {{ lines: string[], updated: boolean }}
 */
export function renameLyricSectionHeader(lyricLines, oldHeader, newHeader) {
  const lines = Array.isArray(lyricLines)
    ? lyricLines.map(function(line) { return String(line == null ? '' : line); })
    : [];
  const want = normalizeStanzaNameKey(oldHeader);
  const nextHeader = formatLyricSectionHeader(newHeader);
  if (!want || !nextHeader) {
    return { lines: lines, updated: false };
  }
  let updated = false;
  const out = lines.map(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return line;
    if (normalizeStanzaNameKey(trimmed) === want) {
      updated = true;
      return nextHeader;
    }
    return line;
  });
  return { lines: out, updated: updated };
}

/**
 * Append a named section header at the end of lyrics text.
 */
export function appendLyricSection(text, name) {
  const header = formatLyricSectionHeader(name);
  if (!header) return String(text == null ? '' : text);
  const base = String(text == null ? '' : text).replace(/\s+$/, '');
  return base ? (base + '\n\n' + header + '\n') : (header + '\n');
}

/**
 * Character offset of the start of a 0-based line in multiline text.
 */
export function lineIndexToCharOffset(text, lineIndex) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const target = Math.max(0, Number(lineIndex) || 0);
  let offset = 0;
  for (let i = 0; i < target && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

/**
 * Scroll a textarea so the given 0-based line is at the top of the visible area.
 */
export function scrollTextareaToLine(textarea, lineIndex) {
  if (!textarea) return;
  const text = textarea.value || '';
  const offset = lineIndexToCharOffset(text, lineIndex);
  textarea.focus();
  if (typeof textarea.setSelectionRange === 'function') {
    try {
      textarea.setSelectionRange(offset, offset);
    } catch (e) {
      // Some browsers reject setSelectionRange on non-text inputs.
    }
  }

  const style = window.getComputedStyle(textarea);
  let lineHeight = parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight) || style.lineHeight === 'normal') {
    const fontSize = parseFloat(style.fontSize) || 16;
    lineHeight = fontSize * 1.2;
  }
  const paddingTop = parseFloat(style.paddingTop) || 0;
  textarea.scrollTop = Math.max(0, (Number(lineIndex) || 0) * lineHeight - paddingTop);
}
