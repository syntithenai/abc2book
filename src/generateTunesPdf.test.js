import {
  PRINT_PAGE_HEIGHT_PX,
  PRINT_PDF_CAPTURE_SCALE,
  getPrintSvgRasterSize,
  shouldSplitPrintBackgroundInfo,
} from './generateTunesPdf';

function mockPageLayout(pageHeight, bgTop, bgHeight) {
  const pageEl = {
    scrollTop: 0,
    getBoundingClientRect: function() {
      return { top: 0 };
    },
  };
  const bgEl = {
    offsetHeight: bgHeight,
    getBoundingClientRect: function() {
      return { top: bgTop };
    },
  };
  return shouldSplitPrintBackgroundInfo(pageEl, bgEl, pageHeight);
}

describe('shouldSplitPrintBackgroundInfo', function() {
  test('returns false when background info fits on the current page', function() {
    expect(mockPageLayout(PRINT_PAGE_HEIGHT_PX, 700, 200)).toBe(false);
  });

  test('returns false when background info starts at the top of the page', function() {
    expect(mockPageLayout(PRINT_PAGE_HEIGHT_PX, 0, 500)).toBe(false);
  });

  test('returns true when background info would spill off the page', function() {
    expect(mockPageLayout(PRINT_PAGE_HEIGHT_PX, 1000, 200)).toBe(true);
  });

  test('returns true when background info starts on a later page', function() {
    expect(mockPageLayout(PRINT_PAGE_HEIGHT_PX, PRINT_PAGE_HEIGHT_PX + 40, 300)).toBe(true);
  });
});

describe('getPrintSvgRasterSize', function() {
  test('rasters notation SVGs above CSS size for print DPI', function() {
    const size = getPrintSvgRasterSize(400, 200, PRINT_PDF_CAPTURE_SCALE);
    expect(size.cssWidth).toBe(400);
    expect(size.cssHeight).toBe(200);
    expect(size.canvasWidth).toBe(400 * PRINT_PDF_CAPTURE_SCALE);
    expect(size.canvasHeight).toBe(200 * PRINT_PDF_CAPTURE_SCALE);
    expect(PRINT_PDF_CAPTURE_SCALE).toBeGreaterThanOrEqual(3);
  });
});
