jest.mock('html2canvas')

jest.mock('jspdf', function() {
  function MockJsPDF() {
    this.internal = {
      pageSize: {
        getWidth: function() { return 794 },
        getHeight: function() { return 1123 },
      },
    }
    this.autoPrint = jest.fn()
    this.addPage = jest.fn()
    this.addImage = jest.fn()
    this.output = jest.fn(function() {
      return new Blob(['pdf'], { type: 'application/pdf' })
    })
  }
  return {
    __esModule: true,
    jsPDF: MockJsPDF,
  }
})

jest.mock('./platformUtils', function() {
  return {
    isAndroidApp: function() { return false },
  }
})

jest.mock('./nativeFileSave')

import {
  PRINT_PAGE_HEIGHT_PX,
  PRINT_INNER_WIDTH_PX,
  PRINT_PDF_CAPTURE_SCALE,
  generateTunesPdf,
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

function createPrintContainer(pageCount) {
  const container = document.createElement('div')
  for (let i = 0; i < pageCount; i += 1) {
    const page = document.createElement('div')
    page.className = 'print-pdf-tune-page'
    Object.defineProperty(page, 'offsetTop', { configurable: true, value: i * PRINT_PAGE_HEIGHT_PX })
    Object.defineProperty(page, 'offsetHeight', { configurable: true, value: PRINT_PAGE_HEIGHT_PX })
    const inner = document.createElement('div')
    inner.className = 'print-pdf-tune-inner'
    Object.defineProperty(inner, 'offsetWidth', { configurable: true, value: PRINT_INNER_WIDTH_PX })
    page.appendChild(inner)
    container.appendChild(page)
  }
  return container
}

describe('generateTunesPdf onProgress', function() {
  beforeEach(function() {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(function(cb) {
      cb(0)
      return 0
    })
    global.URL.createObjectURL = jest.fn(function() {
      return 'blob:mock'
    })
    global.URL.revokeObjectURL = jest.fn()
  })

  afterEach(function() {
    window.requestAnimationFrame.mockRestore()
  })

  test('reports progress once per print page', async function() {
    const container = createPrintContainer(3)
    const progressEvents = []

    await generateTunesPdf(container, 'selected.pdf', {
      onProgress: function(event) {
        progressEvents.push(event)
      },
    })

    expect(progressEvents).toHaveLength(3)
    expect(progressEvents[0]).toEqual({
      current: 1,
      total: 3,
      percent: 33,
      message: 'Preparing tune 1 of 3',
    })
    expect(progressEvents[2]).toEqual({
      current: 3,
      total: 3,
      percent: 100,
      message: 'Preparing tune 3 of 3',
    })
  })
});
