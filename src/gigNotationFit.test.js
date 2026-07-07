import {
  GIG_NOTATION_FIT_SAFETY_PX,
  NOTATION_FIT_HORIZONTAL,
  NOTATION_FIT_VERTICAL,
  buildFitFrame,
  computeNotationFit,
  findStaffWidthForVerticalFit,
  fitSingleViewVertical,
  horizontalFitTargetWidth,
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

  describe('fitSingleViewVertical', function() {
    function makeSvg(width, height) {
      return {
        viewBox: { baseVal: { x: 0, y: 0, width: width, height: height } },
        getAttribute: function(name) {
          if (name === 'viewBox') return '0 0 ' + width + ' ' + height;
          if (name === 'width') return String(width);
          if (name === 'height') return String(height);
          return null;
        },
        setAttribute: function() {},
        removeAttribute: function() {},
        style: {},
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
      const availW = 420 - 20 - 8;
      const availH = 700 - 100 - 8;
      const targetW = availW - GIG_NOTATION_FIT_SAFETY_PX;
      const targetH = availH - GIG_NOTATION_FIT_SAFETY_PX;
      // Width-limited contain: scaleW < scaleH
      expect(fit.width).toBeCloseTo(targetW, 5);
      expect(fit.height).toBeCloseTo(200 * (targetW / 800), 5);
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
