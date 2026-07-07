export const PRINT_LYRICS_BASE_FONT_PX = 14;
export const PRINT_LYRICS_MIN_FONT_PX = 9;
export const PRINT_LYRICS_BESIDE_CHORDS_BASE_FONT_PX = 20;
export const PRINT_LYRICS_BESIDE_CHORDS_MAX_FONT_PX = 44;
export const PRINT_LYRICS_LAYOUT_SAFETY_PX = 16;

export function getOffsetTopWithin(child, ancestor) {
  if (!child || !ancestor) return 0;
  const childRect = child.getBoundingClientRect();
  const ancestorRect = ancestor.getBoundingClientRect();
  return childRect.top - ancestorRect.top + ancestor.scrollTop;
}

export function getRemainingPageHeightFromTop(topPx, pageHeightPx, footerReservePx) {
  if (!(pageHeightPx > 0)) return 0;
  const positionOnPage = Math.max(0, topPx) % pageHeightPx;
  return Math.max(0, pageHeightPx - positionOnPage - (footerReservePx || 0));
}

export function getSafeLyricsAvailableHeight(anchorTopPx, pageHeightPx, footerReservePx, contentBelowPx) {
  const reserve = (footerReservePx || 0) + (contentBelowPx || 0) + PRINT_LYRICS_LAYOUT_SAFETY_PX;
  return getRemainingPageHeightFromTop(anchorTopPx, pageHeightPx, reserve);
}

export function applyProbeLyricsStyles(probeRoot, columns, fontSizePx) {
  if (!probeRoot) return;
  const colEl = probeRoot.querySelector('.print-pdf-lyrics-columns');
  const lyricsEl = probeRoot.querySelector('.music-view-lyrics');
  if (colEl) {
    if (columns === 1) {
      colEl.className = 'print-pdf-lyrics-columns print-pdf-lyrics-columns--1';
    } else {
      const columnCount = columns === 3 ? 3 : 2;
      colEl.className = 'print-pdf-lyrics-columns print-pdf-lyrics-columns--' + columnCount;
    }
  }
  if (lyricsEl) {
    lyricsEl.style.fontSize = fontSizePx + 'px';
    lyricsEl.style.lineHeight = '1.45';
  }
  void probeRoot.offsetHeight;
}

export function measureProbeLyricsHeight(probeRoot, columns, fontSizePx) {
  applyProbeLyricsStyles(probeRoot, columns, fontSizePx);
  return probeRoot.offsetHeight || 0;
}

export function findLargestFontSizeToFit(measureFn, availableHeightPx, minFontPx, maxFontPx) {
  const min = minFontPx || PRINT_LYRICS_MIN_FONT_PX;
  const max = maxFontPx || PRINT_LYRICS_BASE_FONT_PX;
  if (typeof measureFn !== 'function' || !(availableHeightPx > 0)) return min;
  for (let fontSizePx = max; fontSizePx >= min; fontSizePx -= 1) {
    const height = measureFn(fontSizePx);
    if (height > 0 && height <= availableHeightPx) {
      return fontSizePx;
    }
  }
  return min;
}

export function resolvePrintLyricsBesideChordsLayout(params) {
  const availableHeightPx = params.availableHeightPx || 0;
  const measure1Col = params.measure1Col;
  const minFontPx = params.minFontPx || PRINT_LYRICS_MIN_FONT_PX;
  const maxFontPx = params.maxFontPx || PRINT_LYRICS_BESIDE_CHORDS_MAX_FONT_PX;
  const fontSizePx = findLargestFontSizeToFit(measure1Col, availableHeightPx, minFontPx, maxFontPx);
  return {
    placement: 'inline',
    columns: 1,
    fontSizePx: fontSizePx,
  };
}

function findLayoutInAvailable(measure1Col, measure2Col, measure3Col, available, options) {
  const baseFontPx = options.baseFontPx || PRINT_LYRICS_BASE_FONT_PX;
  const minFontPx = options.minFontPx || PRINT_LYRICS_MIN_FONT_PX;
  const allow3Col = options.allow3Col !== false;
  const allow2Col = options.allow2Col !== false;
  const allow1Col = options.allow1Col !== false && measure1Col;

  if (allow3Col && measure3Col) {
    for (let fontSizePx = baseFontPx; fontSizePx >= minFontPx; fontSizePx -= 1) {
      const height = measure3Col(fontSizePx);
      if (height > 0 && height <= available) {
        return { columns: 3, fontSizePx: fontSizePx };
      }
    }
  }
  if (allow2Col && measure2Col) {
    for (let fontSizePx = baseFontPx; fontSizePx >= minFontPx; fontSizePx -= 1) {
      const height = measure2Col(fontSizePx);
      if (height > 0 && height <= available) {
        return { columns: 2, fontSizePx: fontSizePx };
      }
    }
  }
  if (allow1Col) {
    for (let fontSizePx = baseFontPx; fontSizePx >= minFontPx; fontSizePx -= 1) {
      const height = measure1Col(fontSizePx);
      if (height > 0 && height <= available) {
        return { columns: 1, fontSizePx: fontSizePx };
      }
    }
  }
  return null;
}

export const PRINT_LYRICS_SPLIT_PAGE_TOP_RESERVE_PX = 150;

export function resolvePrintLyricsSplitPageLayout(params) {
  const splitPageTopReservePx = params.splitPageTopReservePx || PRINT_LYRICS_SPLIT_PAGE_TOP_RESERVE_PX;
  const pageHeightPx = params.pageHeightPx;
  const footerReservePx = params.footerReservePx || 76;
  const baseFontPx = params.baseFontPx || PRINT_LYRICS_BASE_FONT_PX;
  const minFontPx = params.minFontPx || PRINT_LYRICS_MIN_FONT_PX;
  const allow3Col = params.allow3Col !== false;
  const measure2Col = params.measure2Col;
  const measure3Col = params.measure3Col;

  const available = getSafeLyricsAvailableHeight(
    splitPageTopReservePx,
    pageHeightPx,
    footerReservePx,
    0
  );
  const layout = findLayoutInAvailable(
    null,
    measure2Col,
    allow3Col ? measure3Col : null,
    available,
    {
      baseFontPx: baseFontPx,
      minFontPx: minFontPx,
      allow1Col: false,
      allow2Col: !!measure2Col,
      allow3Col: allow3Col,
    }
  );
  if (layout) {
    return Object.assign({ placement: 'split' }, layout);
  }
  return {
    placement: 'split',
    columns: allow3Col ? 3 : 2,
    fontSizePx: minFontPx,
  };
}

export function resolvePrintLyricsLayoutWithMeasurement(params) {
  const anchorTopPx = params.anchorTopPx || 0;
  const pageHeightPx = params.pageHeightPx;
  const footerReservePx = params.footerReservePx || 76;
  const splitPageTopReservePx = params.splitPageTopReservePx || PRINT_LYRICS_SPLIT_PAGE_TOP_RESERVE_PX;
  const contentBelowPx = params.contentBelowPx || 0;
  const baseFontPx = params.baseFontPx || PRINT_LYRICS_BASE_FONT_PX;
  const minFontPx = params.minFontPx || PRINT_LYRICS_MIN_FONT_PX;
  const allow2Col = params.allow2Col !== false;
  const allow3Col = params.allow3Col !== false;
  const allowSplit = params.allowSplit !== false;
  const measure1Col = params.measure1Col;
  const measure2Col = params.measure2Col;
  const measure3Col = params.measure3Col;

  const availableInline = getSafeLyricsAvailableHeight(
    anchorTopPx,
    pageHeightPx,
    footerReservePx,
    contentBelowPx
  );

  const inline = findLayoutInAvailable(
    measure1Col,
    allow2Col ? measure2Col : null,
    allow3Col ? measure3Col : null,
    availableInline,
    {
      baseFontPx: baseFontPx,
      minFontPx: minFontPx,
      allow1Col: !!measure1Col,
      allow2Col: allow2Col,
      allow3Col: allow3Col,
    }
  );
  if (inline) {
    return Object.assign({ placement: 'inline' }, inline);
  }

  if (allowSplit) {
    const availableSplitPage = getSafeLyricsAvailableHeight(
      splitPageTopReservePx,
      pageHeightPx,
      footerReservePx,
      0
    );
    const split = findLayoutInAvailable(null, measure2Col, measure3Col, availableSplitPage, {
      baseFontPx: baseFontPx,
      minFontPx: minFontPx,
      allow1Col: false,
      allow2Col: !!measure2Col,
      allow3Col: true,
    });
    if (split) {
      return Object.assign({ placement: 'split' }, split);
    }
    return {
      placement: 'split',
      columns: 3,
      fontSizePx: minFontPx,
    };
  }

  const fallback = findLayoutInAvailable(null, measure2Col, measure3Col, availableInline, {
    baseFontPx: minFontPx,
    minFontPx: minFontPx,
    allow1Col: false,
    allow2Col: !!measure2Col,
    allow3Col: true,
  });
  if (fallback) {
    return Object.assign({ placement: 'inline' }, fallback);
  }
  if (measure1Col) {
    return {
      placement: 'inline',
      columns: 1,
      fontSizePx: minFontPx,
    };
  }
  return {
    placement: 'inline',
    columns: allow3Col ? 3 : 2,
    fontSizePx: minFontPx,
  };
}

export function lyricsBlockOverflowsPage(pageEl, blockEl, anchorEl, pageHeightPx, footerReservePx, contentBelowPx) {
  if (!pageEl || !blockEl) return false;
  const anchorTop = anchorEl ? getOffsetTopWithin(anchorEl, pageEl) : getOffsetTopWithin(blockEl, pageEl);
  const available = getSafeLyricsAvailableHeight(
    anchorTop,
    pageHeightPx,
    footerReservePx,
    contentBelowPx
  );
  return blockEl.offsetHeight > available + 1;
}

export function getPrintPageFooterReserve(pageEl) {
  if (!pageEl || typeof pageEl.querySelector !== 'function') return 76;
  const footer = pageEl.querySelector('.print-pdf-page-footer');
  const footerHeight = footer && footer.offsetHeight > 0 ? footer.offsetHeight : 36;
  return footerHeight + 40;
}

/** @deprecated Use resolvePrintLyricsLayoutWithMeasurement in the browser. */
export function resolvePrintLyricsLayout(params) {
  return resolvePrintLyricsLayoutWithMeasurement(Object.assign({}, params, {
    allowSplit: true,
    measure2Col: function(fontSizePx) {
      return params.height2Col > 0 ? (params.height2Col * fontSizePx) / PRINT_LYRICS_BASE_FONT_PX : 0;
    },
    measure3Col: function(fontSizePx) {
      return params.height3Col > 0 ? (params.height3Col * fontSizePx) / PRINT_LYRICS_BASE_FONT_PX : 0;
    },
  }));
}

/** @deprecated Use resolvePrintLyricsLayoutWithMeasurement in the browser. */
export function resolvePrintLyricsOnlyLayout(params) {
  return resolvePrintLyricsLayoutWithMeasurement(Object.assign({}, params, {
    allowSplit: false,
    measure2Col: function(fontSizePx) {
      return params.height2Col > 0 ? (params.height2Col * fontSizePx) / PRINT_LYRICS_BASE_FONT_PX : 0;
    },
    measure3Col: function(fontSizePx) {
      return params.height3Col > 0 ? (params.height3Col * fontSizePx) / PRINT_LYRICS_BASE_FONT_PX : 0;
    },
  }));
}

export function scaleHeightForFontSize(heightPx, fromFontPx, toFontPx) {
  if (!(heightPx > 0) || !(fromFontPx > 0) || !(toFontPx > 0)) return heightPx;
  return heightPx * (toFontPx / fromFontPx);
}

export function findFontSizeToFit(columns, heightAtBase, available, baseFontPx, minFontPx) {
  if (!(heightAtBase > 0) || !(available > 0)) return null;
  for (let fontSizePx = baseFontPx; fontSizePx >= minFontPx; fontSizePx -= 1) {
    const scaledHeight = scaleHeightForFontSize(heightAtBase, baseFontPx, fontSizePx);
    if (scaledHeight <= available) {
      return { columns: columns, fontSizePx: fontSizePx };
    }
  }
  return null;
}
