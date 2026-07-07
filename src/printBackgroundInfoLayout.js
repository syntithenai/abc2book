import { getOffsetTopWithin, getPrintPageFooterReserve } from './printLyricsLayout';
import { PRINT_PAGE_HEIGHT_PX } from './generateTunesPdf';

export const PRINT_BACKGROUND_LAYOUT_SAFETY_PX = 8;
export const PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX = 150;
export const PRINT_BACKGROUND_CONTINUATION_NO_HEADER_TOP_RESERVE_PX = 24;
export const PRINT_BACKGROUND_BASE_FONT_PX = 14;
export const PRINT_BACKGROUND_MIN_FONT_PX = 9;

export function isBoldOnlySectionTitleBlock(block) {
  if (!block || block.type !== 'paragraph' || !Array.isArray(block.lines)) return false;
  if (block.lines.length !== 1) return false;
  const nodes = block.lines[0];
  if (!Array.isArray(nodes) || nodes.length !== 1) return false;
  if (nodes[0].type !== 'strong') return false;
  const text = (nodes[0].children || []).map(function(node) {
    return node && node.type === 'text' ? node.value : '';
  }).join('').trim();
  return text.length > 0 && text.length <= 120;
}

export function isSectionStartBlock(block) {
  return isHeadingBlock(block) || isBoldOnlySectionTitleBlock(block);
}

export function groupMarkdownBlocksIntoSections(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const sections = [];
  let start = 0;
  blocks.forEach(function(block, index) {
    if (isSectionStartBlock(block) && index > start) {
      sections.push({ start: start, end: index - 1 });
      start = index;
    }
  });
  sections.push({ start: start, end: blocks.length - 1 });
  return sections;
}

export function isHeadingBlock(block) {
  return !!(block && block.type === 'heading');
}

export function getInlineText(nodes) {
  if (!Array.isArray(nodes)) return '';
  return nodes.map(function(node) {
    if (!node) return '';
    if (node.type === 'text') return node.value || '';
    if (node.children) return getInlineText(node.children);
    return '';
  }).join('');
}

export function getMarkdownBlockTitleText(block) {
  if (isHeadingBlock(block)) {
    return getInlineText(block.children).trim();
  }
  if (isBoldOnlySectionTitleBlock(block)) {
    const nodes = block.lines && block.lines[0];
    if (Array.isArray(nodes) && nodes[0] && nodes[0].type === 'strong') {
      return getInlineText(nodes[0].children).trim();
    }
  }
  return '';
}

export function isRecordLabelsSectionTitle(text) {
  return /\b(record\s+labels?\s+and\s+releases?|labels?\s+and\s+releases?|releases?\s+and\s+(record\s+)?labels?|record\s+labels?)\b/i.test(
    String(text || '')
  );
}

export function isNotableRecordingsSectionTitle(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  if (/^notable\s+recordings(\s+and|\s*$)/.test(normalized)) return true;
  if (/^notable\s+performers(\s+and|\s|$)/.test(normalized)) return true;
  if (/^(notable\s+recordings\s+and\s+)?youtube(\s+links)?\b/.test(normalized)) return true;
  if (/\bnotable\s+(recordings|performers)\b/.test(normalized)) return true;
  return false;
}

export function isBackgroundMainPageSectionTitle(text) {
  return isRecordLabelsSectionTitle(text) || isNotableRecordingsSectionTitle(text);
}

/** Last block index that must stay on the tune page with notation/lyrics/chords. */
export function findBackgroundMainPageEndBlockIndex(blocks) {
  const sections = groupMarkdownBlocksIntoSections(blocks);
  let endIndex = null;
  sections.forEach(function(section) {
    const title = getMarkdownBlockTitleText(blocks[section.start]);
    if (isBackgroundMainPageSectionTitle(title)) {
      endIndex = section.end;
    }
  });
  return endIndex;
}

export function splitBackgroundBlocksForPrint(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { mainBlockIndices: [], suffixBlockIndices: [] };
  }
  const mainEnd = findBackgroundMainPageEndBlockIndex(blocks);
  if (mainEnd == null) {
    return {
      mainBlockIndices: [],
      suffixBlockIndices: blocks.map(function(_, index) { return index; }),
    };
  }
  const mainBlockIndices = [];
  for (let i = 0; i <= mainEnd; i += 1) {
    mainBlockIndices.push(i);
  }
  const suffixBlockIndices = [];
  for (let j = mainEnd + 1; j < blocks.length; j += 1) {
    suffixBlockIndices.push(j);
  }
  return { mainBlockIndices: mainBlockIndices, suffixBlockIndices: suffixBlockIndices };
}

function findFirstLinkNode(nodes) {
  if (!Array.isArray(nodes)) return null;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node && node.type === 'link') return node;
    if (node && node.children) {
      const found = findFirstLinkNode(node.children);
      if (found) return found;
    }
  }
  return null;
}

export function extractLinksFromListItems(items) {
  const links = [];
  (items || []).forEach(function(itemNodes) {
    const linkNode = findFirstLinkNode(itemNodes);
    if (linkNode && linkNode.href) {
      links.push({
        href: linkNode.href,
        label: getInlineText(linkNode.children).trim() || linkNode.href,
      });
    }
  });
  return links;
}

export function blockIndicesToPages(blockIndices, pagesOfLocalIndices) {
  return (pagesOfLocalIndices || []).map(function(localIndices) {
    return localIndices.map(function(localIndex) {
      return blockIndices[localIndex];
    }).filter(function(index) { return index != null; });
  });
}

export function expandBackgroundBlocksForPrint(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const expanded = [];
  let sectionTitle = '';
  blocks.forEach(function(block) {
    if (isSectionStartBlock(block)) {
      sectionTitle = getMarkdownBlockTitleText(block);
    }
    if ((block.type === 'ul' || block.type === 'ol') && isNotableRecordingsSectionTitle(sectionTitle)) {
      extractLinksFromListItems(block.items).forEach(function(link) {
        expanded.push({
          type: 'printRecordingLink',
          href: link.href,
          label: link.label,
        });
      });
      return;
    }
    expanded.push(block);
  });
  return expanded;
}

/** Sections for pagination; recording links are atomic rows. */
export function groupMarkdownBlocksIntoLayoutSections(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const sections = [];
  let start = 0;
  blocks.forEach(function(block, index) {
    const sectionBreak = isSectionStartBlock(block) && index > start;
    const linkBreak = block && block.type === 'printRecordingLink' && index > start;
    if (sectionBreak || linkBreak) {
      sections.push({ start: start, end: index - 1 });
      start = index;
    }
  });
  sections.push({ start: start, end: blocks.length - 1 });
  return sections;
}

export function getMainTunePageBackgroundAvailablePx(pageEl, anchorEl, dividerPx) {
  if (!pageEl || !anchorEl) return 0;
  const anchorTop = getOffsetTopWithin(anchorEl, pageEl);
  if (!(anchorTop > 0)) return 0;
  const footerReservePx = getPrintBackgroundFooterReserve(pageEl);
  return getPrintBackgroundAvailableHeight(
    PRINT_PAGE_HEIGHT_PX,
    anchorTop + (dividerPx || 12),
    footerReservePx,
    PRINT_BACKGROUND_LAYOUT_SAFETY_PX
  );
}

export function getBackgroundBlockHeightsFromElements(blockEls) {
  return (Array.isArray(blockEls) ? blockEls : []).map(function(el) {
    return el && el.offsetHeight > 0 ? el.offsetHeight : 0;
  });
}

export function getPrintBackgroundAvailableHeight(pageHeightPx, topReservePx, footerReservePx, safetyPx) {
  const reserve = (topReservePx || 0) + (footerReservePx || 0) + (safetyPx != null ? safetyPx : PRINT_BACKGROUND_LAYOUT_SAFETY_PX);
  return Math.max(0, (pageHeightPx || 0) - reserve);
}

export function getPrintBackgroundFooterReserve(pageEl) {
  return getPrintPageFooterReserve(pageEl);
}

export function getBackgroundSectionBlockIndices(section) {
  const indices = [];
  for (let i = section.start; i <= section.end; i += 1) {
    indices.push(i);
  }
  return indices;
}

export function getSectionHeightPx(section, blockHeights) {
  let height = 0;
  for (let i = section.start; i <= section.end; i += 1) {
    height += (blockHeights && blockHeights[i]) || 0;
  }
  return height;
}

export function scaleBackgroundContentHeight(heightAtBasePx, fontSizePx, baseFontPx) {
  const base = baseFontPx || PRINT_BACKGROUND_BASE_FONT_PX;
  if (!(heightAtBasePx > 0) || !(fontSizePx > 0) || !(base > 0)) return heightAtBasePx;
  return heightAtBasePx * (fontSizePx / base);
}

/** True when content at base font size fits in the available height. */
export function pageContentFitsAvailableAtBaseFont(totalHeightAtBasePx, availableHeightPx) {
  if (!(totalHeightAtBasePx > 0)) return true;
  if (!(availableHeightPx > 0)) return false;
  return totalHeightAtBasePx <= availableHeightPx;
}

/** True when content at min font size fits in the available height. */
export function pageContentFitsAvailable(totalHeightAtBasePx, availableHeightPx, options) {
  const baseFontPx = (options && options.baseFontPx) || PRINT_BACKGROUND_BASE_FONT_PX;
  const minFontPx = (options && options.minFontPx) || PRINT_BACKGROUND_MIN_FONT_PX;
  if (!(totalHeightAtBasePx > 0)) return true;
  if (!(availableHeightPx > 0)) return false;
  return scaleBackgroundContentHeight(totalHeightAtBasePx, minFontPx, baseFontPx) <= availableHeightPx;
}

export function shouldBackgroundStartOnNewPrintPage(options) {
  if (!options || !options.canSplitBackground) return false;
  return !!(options.showLyrics || options.showChordsBlockColumn || options.showNotation);
}

/**
 * Split pagination output into main-tune-page vs continuation-page block indices.
 * When shouldStartOnNewPage is true, nothing is shown below lyrics/chords on page 1.
 */
export function resolveBackgroundPageLayout(blockPages, shouldStartOnNewPage) {
  if (!Array.isArray(blockPages) || blockPages.length === 0) {
    return { mainBlockIndices: null, continuationPages: [] };
  }
  if (!shouldStartOnNewPage) {
    const mainBlockIndices = blockPages[0] && blockPages[0].length > 0 ? blockPages[0] : null;
    const continuationPages = blockPages.length > 1 ? blockPages.slice(1) : [];
    return { mainBlockIndices: mainBlockIndices, continuationPages: continuationPages };
  }
  if (blockPages[0] && blockPages[0].length === 0) {
    return { mainBlockIndices: null, continuationPages: blockPages.slice(1) };
  }
  return { mainBlockIndices: null, continuationPages: blockPages };
}

export function getBackgroundContinuationPageFontSize(fontSizes, blockPages, continuationPageIndex, shouldStartOnNewPage) {
  if (!Array.isArray(fontSizes) || fontSizes.length === 0) {
    return PRINT_BACKGROUND_BASE_FONT_PX;
  }
  if (shouldStartOnNewPage && blockPages && blockPages[0] && blockPages[0].length === 0) {
    return fontSizes[continuationPageIndex + 1] || fontSizes[continuationPageIndex] || PRINT_BACKGROUND_BASE_FONT_PX;
  }
  return fontSizes[continuationPageIndex] || fontSizes[continuationPageIndex + 1] || PRINT_BACKGROUND_BASE_FONT_PX;
}

/**
 * Pack whole markdown sections onto as few pages as possible. Sections are never split.
 */
export function assignBackgroundBlocksToPages(blockHeights, blocks, options) {
  const sections = groupMarkdownBlocksIntoLayoutSections(blocks);
  if (sections.length === 0) return [[]];

  const getAvailableForPage = options && options.getAvailableForPage;
  if (typeof getAvailableForPage !== 'function') {
    return [blocks.map(function(_, index) { return index; })];
  }

  const fitOptions = {
    baseFontPx: (options && options.baseFontPx) || PRINT_BACKGROUND_BASE_FONT_PX,
    minFontPx: (options && options.minFontPx) || PRINT_BACKGROUND_MIN_FONT_PX,
    useBaseFontForPageFit: !!(options && options.useBaseFontForPageFit),
  };

  function sectionFitsOnPage(totalHeightAtBasePx, availableHeightPx) {
    if (fitOptions.useBaseFontForPageFit) {
      return pageContentFitsAvailableAtBaseFont(totalHeightAtBasePx, availableHeightPx);
    }
    return pageContentFitsAvailable(totalHeightAtBasePx, availableHeightPx, fitOptions);
  }

  const pages = [];
  let currentPageIndices = [];
  let currentPageHeight = 0;
  let pageIndex = 0;

  if (options && options.forceBackgroundContinuationOnly) {
    pages.push([]);
    pageIndex = 1;
  }

  sections.forEach(function(section) {
    const sectionIndices = getBackgroundSectionBlockIndices(section);
    const sectionHeight = getSectionHeightPx(section, blockHeights);
    let available = getAvailableForPage(pageIndex);
    const combinedHeight = currentPageHeight + sectionHeight;

    if (currentPageIndices.length === 0
        && pageIndex === 0
        && options && options.skipMainPageWhenSectionDoesNotFit
        && !sectionFitsOnPage(sectionHeight, available)) {
      pages.push([]);
      pageIndex += 1;
      available = getAvailableForPage(pageIndex);
    }

    if (currentPageIndices.length > 0
        && !sectionFitsOnPage(combinedHeight, available)) {
      pages.push(currentPageIndices);
      currentPageIndices = [];
      currentPageHeight = 0;
      pageIndex += 1;
    }

    sectionIndices.forEach(function(index) {
      currentPageIndices.push(index);
    });
    currentPageHeight += sectionHeight;
  });

  if (currentPageIndices.length > 0) {
    pages.push(currentPageIndices);
  }

  return pages.length > 0 ? pages : [[]];
}

export function resolveBackgroundSectionFontSize(sectionHeightPx, availableHeightPx, baseFontPx, minFontPx) {
  const base = baseFontPx || PRINT_BACKGROUND_BASE_FONT_PX;
  const min = minFontPx || PRINT_BACKGROUND_MIN_FONT_PX;
  if (!(sectionHeightPx > 0) || !(availableHeightPx > 0)) return base;
  if (sectionHeightPx <= availableHeightPx) return base;
  for (let fontSizePx = base - 1; fontSizePx >= min; fontSizePx -= 1) {
    const scaledHeight = sectionHeightPx * (fontSizePx / base);
    if (scaledHeight <= availableHeightPx) {
      return fontSizePx;
    }
  }
  return min;
}

export function estimateBackgroundFirstPageTopReserve(hasQrHeader, headerHeightPx) {
  if (headerHeightPx > 0) return headerHeightPx + 12;
  if (hasQrHeader) return 168;
  return PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
}

export function buildBackgroundPrintPageAvailability(options) {
  const mainPageAvailablePx = options.mainPageAvailablePx || 0;
  const infoOnlyFullPage = !!options.infoOnlyFullPage;
  const getContinuationAvailable = buildBackgroundPageAvailability(options);
  return function getAvailableForPage(pageIndex) {
    if (infoOnlyFullPage) {
      return getContinuationAvailable(pageIndex);
    }
    if (pageIndex === 0 && mainPageAvailablePx > 0) {
      return mainPageAvailablePx;
    }
    return getContinuationAvailable(Math.max(0, pageIndex - 1));
  };
}

export function buildBackgroundPageAvailability(options) {
  const pageHeightPx = options.pageHeightPx || PRINT_PAGE_HEIGHT_PX;
  const footerReservePx = options.footerReservePx || 76;
  const firstPageTopReservePx = options.firstPageTopReservePx || PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
  const continuationTopReservePx = options.continuationTopReservePx || PRINT_BACKGROUND_CONTINUATION_TOP_RESERVE_PX;
  const continuationNoHeaderTopReservePx = options.continuationNoHeaderTopReservePx
    || PRINT_BACKGROUND_CONTINUATION_NO_HEADER_TOP_RESERVE_PX;
  const dividerReservePx = options.dividerReservePx || 0;
  const hasHeaderOnPage = options.hasHeaderOnPage;

  return function getAvailableForPage(pageIndex) {
    const showHeader = typeof hasHeaderOnPage === 'function'
      ? hasHeaderOnPage(pageIndex)
      : pageIndex === 0;
    let topReserve;
    if (pageIndex === 0) {
      topReserve = (showHeader ? firstPageTopReservePx : continuationNoHeaderTopReservePx) + dividerReservePx;
    } else {
      topReserve = showHeader ? continuationTopReservePx : continuationNoHeaderTopReservePx;
    }
    return getPrintBackgroundAvailableHeight(
      pageHeightPx,
      topReserve,
      footerReservePx,
      PRINT_BACKGROUND_LAYOUT_SAFETY_PX
    );
  };
}
