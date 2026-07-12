import {
  GIG_NOTATION_FIT_SAFETY_PX,
  GIG_NOTATION_FRAME_PAD_X,
  NOTATION_FIT_HORIZONTAL,
  NOTATION_FIT_VERTICAL,
  buildFitFrame,
  computeNotationFit,
  expandNotationViewBoxForMeta,
  findStaffWidthForVerticalFit,
  fitSingleViewVertical,
  horizontalFitTargetWidth,
  measureSingleViewPaper,
  readNotationSvgDims,
  verticalFitTargetHeight,
  verticalScaledWidth,
} from './gigNotationFit';

describe('gigNotationFit', function() {
  describe('buildFitFrame', function() {
    it('adds asymmetric padding around content', function() {
      const frame = buildFitFrame({ x: 100, y: 50, width: 400, height: 200 });
      expect(frame.x).toBe(94);
      expect(frame.y).toBe(18);
      expect(frame.width).toBe(412);
      expect(frame.height).toBe(268);
    });
  });

  describe('computeNotationFit', function() {
    const dims = { width: 400, height: 200 };
    const availW = 300;
    const availH = 600;

    it('fills available width when content is short', function() {
      const fit = computeNotationFit(dims, NOTATION_FIT_HORIZONTAL, availW, availH);
      expect(fit).not.toBeNull();
      expect(fit.mode).toBe(NOTATION_FIT_HORIZONTAL);
      expect(fit.width).toBe(horizontalFitTargetWidth(availW));
      expect(fit.height).toBe(dims.height * (fit.width / dims.width));
      expect(fit.overflowY).toBe(false);
    });

    it('fills width and allows vertical overflow when tune is tall', function() {
      const tall = { width: 400, height: 1200 };
      const fit = computeNotationFit(tall, NOTATION_FIT_HORIZONTAL, availW, availH);
      expect(fit.width).toBe(horizontalFitTargetWidth(availW));
      expect(fit.height).toBe(tall.height * (fit.width / tall.width));
      expect(fit.overflowY).toBe(true);
    });

    it('uses a safety margin below available height for overflow checks', function() {
      const heightAtWidth = horizontalFitTargetWidth(availW) * (dims.height / dims.width);
      const availHJustBelow = heightAtWidth + GIG_NOTATION_FIT_SAFETY_PX;
      const fit = computeNotationFit(dims, NOTATION_FIT_HORIZONTAL, availW, availHJustBelow);
      expect(fit.overflowY).toBe(false);
      expect(verticalFitTargetHeight(availHJustBelow)).toBe(availHJustBelow - GIG_NOTATION_FIT_SAFETY_PX);
    });

    it('fills available height and allows horizontal overflow when content is wide', function() {
      const wide = { width: 800, height: 200 };
      const fit = computeNotationFit(wide, NOTATION_FIT_VERTICAL, availW, availH);
      expect(fit.mode).toBe(NOTATION_FIT_VERTICAL);
      expect(fit.height).toBe(verticalFitTargetHeight(availH));
      expect(fit.width).toBe(wide.width * (fit.height / wide.height));
      expect(fit.overflowX).toBe(true);
      expect(fit.overflowY).toBe(false);
    });

    it('fills height without horizontal overflow when content is tall and narrow', function() {
      const tallNarrow = { width: 200, height: 800 };
      const fit = computeNotationFit(tallNarrow, NOTATION_FIT_VERTICAL, availW, availH);
      expect(fit.height).toBe(verticalFitTargetHeight(availH));
      expect(fit.width).toBe(tallNarrow.width * (fit.height / tallNarrow.height));
      expect(fit.overflowX).toBe(false);
    });
  });

  describe('expandNotationViewBoxForMeta', function() {
    it('expands left/right for a long centered title without shrinking the staff', function() {
      const svg = {
        getAttribute: function(name) {
          if (name === 'width') return '400';
          if (name === 'height') return '200';
          return null;
        },
        getBoundingClientRect: function() {
          return { left: 0, top: 0, width: 400, height: 200 };
        },
        querySelectorAll: function(selector) {
          if (selector.indexOf('title') >= 0 || selector.indexOf('meta-top') >= 0) {
            return [{
              tagName: 'text',
              getBoundingClientRect: function() {
                // Title centered at 200, wider than the staff envelope.
                return { left: -40, top: 10, width: 480, height: 24 };
              },
            }];
          }
          return [];
        },
      };
      const frame = expandNotationViewBoxForMeta(svg, { width: 400, height: 200 });
      expect(frame.x).toBe(-40 - GIG_NOTATION_FRAME_PAD_X);
      expect(frame.width).toBe(480 + (GIG_NOTATION_FRAME_PAD_X * 2));
      expect(frame.y).toBe(0);
      expect(frame.height).toBe(200);
    });

    it('keeps the native envelope when meta does not overhang', function() {
      const svg = {
        getAttribute: function(name) {
          if (name === 'width') return '400';
          if (name === 'height') return '200';
          return null;
        },
        getBoundingClientRect: function() {
          return { left: 0, top: 0, width: 400, height: 200 };
        },
        querySelectorAll: function() { return []; },
      };
      const frame = expandNotationViewBoxForMeta(svg, { width: 400, height: 200 });
      expect(frame.x).toBe(-GIG_NOTATION_FRAME_PAD_X);
      expect(frame.width).toBe(400 + (GIG_NOTATION_FRAME_PAD_X * 2));
      expect(frame.height).toBe(200);
    });
  });

  describe('measureSingleViewPaper', function() {
    it('prefers the viewer width over a wider padded column', function() {
      const column = {
        clientWidth: 500,
        getBoundingClientRect: function() {
          return { left: 0, top: 0, width: 500, height: 400 };
        },
      };
      const renderEl = {
        clientWidth: 420,
        closest: function() { return column; },
        getBoundingClientRect: function() {
          return { left: 40, top: 100, width: 420, height: 50 };
        },
      };
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });

      const paper = measureSingleViewPaper(renderEl);

      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });

      expect(paper.availW).toBe(420 - 8);
      expect(paper.availH).toBe(700 - 100 - 8);
    });
  });

  describe('fitSingleViewVertical', function() {
    function makeSvg(width, height, metaRect) {
      const attrs = {};
      return {
        viewBox: { baseVal: { x: 0, y: 0, width: width, height: height } },
        getAttribute: function(name) {
          if (attrs[name] != null) return attrs[name];
          if (name === 'viewBox') return '0 0 ' + width + ' ' + height;
          if (name === 'width') return String(width);
          if (name === 'height') return String(height);
          return null;
        },
        setAttribute: function(name, value) { attrs[name] = value; },
        removeAttribute: function(name) { delete attrs[name]; },
        style: {},
        getBoundingClientRect: function() {
          return { left: 0, top: 0, width: width, height: height };
        },
        querySelectorAll: function(selector) {
          if (!metaRect) return [];
          if (selector.indexOf('title') >= 0 || selector.indexOf('meta-top') >= 0) {
            return [{
              tagName: 'text',
              getBoundingClientRect: function() { return metaRect; },
            }];
          }
          return [];
        },
      };
    }

    function makeRenderEl() {
      return {
        classList: {
          _items: {},
          add: function(name) { this._items[name] = true; },
          remove: function(name) { delete this._items[name]; },
          toggle: function(name, on) { if (on) this._items[name] = true; else delete this._items[name]; },
          contains: function(name) { return !!this._items[name]; },
        },
        style: {},
        clientWidth: 400,
        closest: function() { return null; },
        getBoundingClientRect: function() {
          return { left: 20, top: 100, width: 400, height: 50 };
        },
        parentElement: null,
      };
    }

    it('reads native svg dims without cropping', function() {
      const svg = makeSvg(400, 800);
      expect(readNotationSvgDims(svg)).toEqual({ width: 400, height: 800 });
    });

    it('contains a wide score so nothing is clipped or scrolled', function() {
      const svg = makeSvg(800, 200);
      const renderEl = makeRenderEl();
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 420 });

      const fit = fitSingleViewVertical(svg, renderEl);

      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });

      expect(fit).not.toBeNull();
      // Viewer width 400 (renderEl), not document width — plus horizontal title pad.
      const availW = 400 - 8;
      const availH = 700 - 100 - 8;
      const targetW = availW - GIG_NOTATION_FIT_SAFETY_PX;
      const targetH = availH - GIG_NOTATION_FIT_SAFETY_PX;
      const frameW = 800 + (GIG_NOTATION_FRAME_PAD_X * 2);
      const frameH = 200;
      // Width-limited contain: scaleW < scaleH
      expect(fit.width).toBeCloseTo(targetW, 5);
      expect(fit.height).toBeCloseTo(frameH * (targetW / frameW), 5);
      expect(fit.height).toBeLessThan(targetH);
      expect(fit.overflowX).toBe(false);
      expect(fit.fillsHeight).toBe(false);
      expect(renderEl.style.overflowX).toBe('hidden');
      expect(renderEl.style.overflowY).toBe('hidden');
    });

    it('fills height when the score aspect ratio fits the page', function() {
      const svg = makeSvg(200, 800);
      const renderEl = makeRenderEl();
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 420 });

      const fit = fitSingleViewVertical(svg, renderEl);

      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });

      const availH = 700 - 100 - 8;
      const targetH = availH - GIG_NOTATION_FIT_SAFETY_PX;
      expect(fit.height).toBeCloseTo(targetH, 5);
      expect(fit.fillsHeight).toBe(true);
      expect(fit.overflowX).toBe(false);
    });

    it('includes title overhang in the viewBox so fit-height does not clip it', function() {
      const svg = makeSvg(400, 800, { left: -60, top: 8, width: 520, height: 28 });
      const renderEl = makeRenderEl();
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

      fitSingleViewVertical(svg, renderEl);

      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });

      const viewBox = svg.getAttribute('viewBox').split(' ').map(Number);
      expect(viewBox[0]).toBe(-60 - GIG_NOTATION_FRAME_PAD_X);
      expect(viewBox[2]).toBe(520 + (GIG_NOTATION_FRAME_PAD_X * 2));
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    });
  });

  describe('findStaffWidthForVerticalFit', function() {
    it('narrows staffwidth when height-scaling would overflow width', function() {
      // Larger staffwidth => shorter/wider score (fewer wraps).
      function renderFn(staffWidth) {
        return {
          dims: { width: staffWidth, height: Math.max(100, 40000 / staffWidth) },
        };
      }
      const availW = 300;
      const availH = 600;
      const fit = findStaffWidthForVerticalFit(renderFn, availW, availH, 800);
      expect(fit.staffWidth).toBeLessThan(horizontalFitTargetWidth(availW));
      expect(verticalScaledWidth(fit.dims, availH)).toBeLessThanOrEqual(availW - GIG_NOTATION_FIT_SAFETY_PX + 1);
    });

    it('keeps page staffwidth when height-scaling already fits', function() {
      function renderFn(staffWidth) {
        return {
          dims: { width: staffWidth, height: staffWidth * 3 },
        };
      }
      const availW = 300;
      const availH = 600;
      const fit = findStaffWidthForVerticalFit(renderFn, availW, availH, 280);
      expect(fit.staffWidth).toBe(280);
    });

    it('does not widen past the page width', function() {
      function renderFn(staffWidth) {
        return {
          dims: { width: staffWidth, height: staffWidth * 3 },
        };
      }
      const availW = 300;
      const availH = 600;
      const fit = findStaffWidthForVerticalFit(renderFn, availW, availH, 120);
      expect(fit.staffWidth).toBeLessThanOrEqual(horizontalFitTargetWidth(availW));
    });
  });

  describe('getSvgContentBBox envelope guard', function() {
    it('extends content upward when staff-only measurement misses meta margin', function() {
      const { getSvgContentBBox } = require('./gigNotationFit');
      const svg = {
        getAttribute: function(name) {
          if (name === 'width') return '400';
          if (name === 'height') return '200';
          return null;
        },
        getBoundingClientRect: function() {
          return { left: 0, top: 0, width: 400, height: 200 };
        },
        querySelectorAll: function(selector) {
          if (selector.indexOf('meta-top') >= 0 || selector.indexOf('composer') >= 0) {
            return [];
          }
          return [{
            getBoundingClientRect: function() {
              return { left: 0, top: 100, width: 400, height: 80 };
            },
          }];
        },
      };
      const box = getSvgContentBBox(svg);
      expect(box.y).toBe(0);
      expect(box.height).toBe(200);
    });
  });
});
