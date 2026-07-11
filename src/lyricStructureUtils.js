import { isSectionHeader, normalizeLyricBlocks, normalizeSectionType } from './chordSheetUtils';

/**
 * Normalize lyric/section lines into typed blocks.
 * Blank lines flush blocks; section headers start blocks.
 *
 * @returns {Array<{ type: string|null, header: string, lines: string[] }>}
 */
export function normalizeLyricStructure(lines) {
  return normalizeLyricBlocks(lines).map(function(block) {
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
}
