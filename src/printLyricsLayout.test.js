import {
  getRemainingPageHeightFromTop,
  getSafeLyricsAvailableHeight,
  PRINT_LYRICS_BASE_FONT_PX,
  PRINT_LYRICS_LAYOUT_SAFETY_PX,
  PRINT_LYRICS_MIN_FONT_PX,
  resolvePrintLyricsLayout,
  resolvePrintLyricsOnlyLayout,
  resolvePrintLyricsSplitPageLayout,
} from './printLyricsLayout';
import { PRINT_PAGE_HEIGHT_PX } from './generateTunesPdf';

describe('getRemainingPageHeightFromTop', function() {
  test('returns space below anchor on the current page', function() {
    expect(getRemainingPageHeightFromTop(700, 1123, 76)).toBe(347);
  });
});

describe('getSafeLyricsAvailableHeight', function() {
  test('reserves space for content below lyrics and layout safety', function() {
    expect(getSafeLyricsAvailableHeight(700, 1123, 76, 120)).toBe(
      347 - 120 - PRINT_LYRICS_LAYOUT_SAFETY_PX
    );
  });
});

describe('resolvePrintLyricsLayout', function() {
  test('uses three columns inline when they fit under the music', function() {
    expect(resolvePrintLyricsLayout({
      anchorTopPx: 500,
      height2Col: 400,
      height3Col: 280,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 3,
      fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
    });
  });

  test('uses two columns inline when three columns are too tall', function() {
    expect(resolvePrintLyricsLayout({
      anchorTopPx: 900,
      height2Col: 140,
      height3Col: 250,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 2,
      fontSizePx: 13,
    });
  });

  test('shrinks lyrics before moving them to the next page', function() {
    expect(resolvePrintLyricsLayout({
      anchorTopPx: 900,
      height2Col: 200,
      height3Col: 260,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 2,
      fontSizePx: 9,
    });
  });

  test('moves all lyrics to the next page only after minimum font size', function() {
    expect(resolvePrintLyricsLayout({
      anchorTopPx: 980,
      height2Col: 220,
      height3Col: 180,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'split',
      columns: 3,
      fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
    });
  });
});

describe('resolvePrintLyricsOnlyLayout', function() {
  test('uses two columns at base font when lyrics fit on the page', function() {
    expect(resolvePrintLyricsOnlyLayout({
      anchorTopPx: 180,
      height2Col: 400,
      height3Col: 5000,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 2,
      fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
    });
  });

  test('shrinks lyrics-only text to fit on one page', function() {
    expect(resolvePrintLyricsOnlyLayout({
      anchorTopPx: 180,
      height2Col: 950,
      height3Col: 2000,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 2,
      fontSizePx: 12,
    });
  });

  test('uses three columns when two columns cannot fit even with smaller font', function() {
    expect(resolvePrintLyricsOnlyLayout({
      anchorTopPx: 180,
      height2Col: 2000,
      height3Col: 900,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 3,
      fontSizePx: 13,
    });
  });

  test('falls back to minimum font when lyrics still overflow', function() {
    expect(resolvePrintLyricsOnlyLayout({
      anchorTopPx: 180,
      height2Col: 2000,
      height3Col: 2000,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
    })).toEqual({
      placement: 'inline',
      columns: 3,
      fontSizePx: PRINT_LYRICS_MIN_FONT_PX,
    });
  });
});

describe('resolvePrintLyricsSplitPageLayout', function() {
  test('prefers three columns on a dedicated lyrics page when they fit', function() {
    expect(resolvePrintLyricsSplitPageLayout({
      height2Col: 500,
      height3Col: 300,
      pageHeightPx: PRINT_PAGE_HEIGHT_PX,
      footerReservePx: 76,
      measure2Col: function(fontSizePx) {
        return (500 * fontSizePx) / PRINT_LYRICS_BASE_FONT_PX;
      },
      measure3Col: function(fontSizePx) {
        return (300 * fontSizePx) / PRINT_LYRICS_BASE_FONT_PX;
      },
    })).toEqual({
      placement: 'split',
      columns: 3,
      fontSizePx: PRINT_LYRICS_BASE_FONT_PX,
    });
  });
});
