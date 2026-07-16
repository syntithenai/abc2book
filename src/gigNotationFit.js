export const NOTATION_FIT_VERTICAL = 'vertical';
export const NOTATION_FIT_HORIZONTAL = 'horizontal';
/** @deprecated Use NOTATION_FIT_VERTICAL */
export const GIG_NOTATION_FIT_VERTICAL = NOTATION_FIT_VERTICAL;
/** @deprecated Use NOTATION_FIT_HORIZONTAL */
export const GIG_NOTATION_FIT_HORIZONTAL = NOTATION_FIT_HORIZONTAL;

export const GIG_NOTATION_MIN_STAFF_WIDTH = 120;
export const GIG_NOTATION_HFILL_MIN_STAFF_FRACTION = 0.6;
export const GIG_NOTATION_FIT_SAFETY_PX = 2;
export const GIG_NOTATION_FRAME_PAD_X = 6;
export const GIG_NOTATION_FRAME_PAD_TOP = 32;
export const GIG_NOTATION_FRAME_PAD_BOTTOM = 36;

const META_SELECTORS = [
  '.abcjs-title',
  '.abcjs-subtitle',
  '.abcjs-meta-top',
  '.abcjs-composer',
  '.abcjs-rhythm',
  '.abcjs-author',
  '.abcjs-part-order',
  '.abcjs-tempo',
  '.abcjs-meter',
].join(', ');

const STAFF_SELECTORS = [
  '.abcjs-instrument-name',
  '.abcjs-staff',
  '.abcjs-top-line',
  '.abcjs-bar',
  '.abcjs-note',
  '.abcjs-lyric',
  '.abcjs-chord',
  '.abcjs-text',
  '.abcjs-slur',
  '.abcjs-tie',
  '.abcjs-beam',
  '.abcjs-rest',
  '.abcjs-clef',
  '.abcjs-key-signature',
  '.abcjs-time-signature',
].join(', ');

function unionBoxes(a, b) {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function absorbBox(minX, minY, maxX, maxY, box) {
  if (!box || (!(box.width > 0) && !(box.height > 0))) {
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, found: false };
  }
  return {
    minX: Math.min(minX, box.x),
    minY: Math.min(minY, box.y),
    maxX: Math.max(maxX, box.x + box.width),
    maxY: Math.max(maxY, box.y + box.height),
    found: true,
  };
}

function boundsToBox(bounds) {
  if (!bounds.found) return null;
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

export function readAbcjsNativeEnvelope(svg) {
  if (!svg) return null;
  const width = parseFloat(svg.getAttribute('width'));
  const height = parseFloat(svg.getAttribute('height'));
  if (!(width > 0) || !(height > 0)) return null;
  return { x: 0, y: 0, width: width, height: height };
}

function estimateTextBBox(textEl) {
  if (!textEl || textEl.tagName !== 'text') return null;
  const anchor = textEl.getAttribute('text-anchor') || 'start';
  const fontSize = parseFloat(textEl.getAttribute('font-size')) || 14;
  const y = parseFloat(textEl.getAttribute('y'));
  const x = parseFloat(textEl.getAttribute('x'));
  if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
  const label = (textEl.textContent || '').trim();
  if (!label) return null;
  const width = Math.max(fontSize * 0.55 * label.length, fontSize);
  const height = fontSize * 1.25;
  let left = x;
  if (anchor === 'middle') left = x - (width / 2);
  if (anchor === 'end') left = x - width;
  return { x: left, y: y - height, width: width, height: height };
}

function measureElementBBoxInSvg(svg, el, svgRect, unitsPerPixelX, unitsPerPixelY) {
  if (!el) return null;

  if (svgRect && unitsPerPixelX > 0 && unitsPerPixelY > 0 && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: (rect.left - svgRect.left) * unitsPerPixelX,
        y: (rect.top - svgRect.top) * unitsPerPixelY,
        width: rect.width * unitsPerPixelX,
        height: rect.height * unitsPerPixelY,
      };
    }
  }

  if (typeof el.getBBox === 'function') {
    try {
      const box = el.getBBox();
      if (box && (box.width > 0 || box.height > 0)) {
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }
    } catch (e) {
      // fall through to text estimate
    }
  }

  if (el.tagName === 'text') {
    return estimateTextBBox(el);
  }

  return null;
}

function measureSelectorBounds(svg, selector) {
  let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, found: false };
  if (!svg || !selector) return bounds;

  const envelope = readAbcjsNativeEnvelope(svg);
  const svgRect = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null;
  const unitsPerPixelX = envelope && svgRect && svgRect.width > 0 ? envelope.width / svgRect.width : 0;
  const unitsPerPixelY = envelope && svgRect && svgRect.height > 0 ? envelope.height / svgRect.height : 0;

  svg.querySelectorAll(selector).forEach(function(el) {
    const box = measureElementBBoxInSvg(svg, el, svgRect, unitsPerPixelX, unitsPerPixelY);
    const next = absorbBox(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, box);
    bounds = Object.assign(bounds, next);
  });

  return bounds;
}

export function measureMetaTextBBox(svg) {
  return boundsToBox(measureSelectorBounds(svg, META_SELECTORS));
}

export function measureStaffContentBBox(svg) {
  return boundsToBox(measureSelectorBounds(svg, STAFF_SELECTORS));
}

export function measureNotationPaper(paperEl, renderEl) {
  const widthEl = paperEl || renderEl || null;
  const heightEl = renderEl || paperEl || null;
  const measuredW = widthEl
    ? Math.max(widthEl.clientWidth || 0, widthEl.offsetWidth || 0)
    : 0;
  const measuredH = heightEl
    ? Math.max(heightEl.clientHeight || 0, heightEl.offsetHeight || 0)
    : 0;
  const availW = measuredW > 0 ? Math.max(100, measuredW) : 100;
  const availH = measuredH > 0 ? Math.max(100, measuredH) : Math.max(100, availW);
  return { availW: availW, availH: availH };
}

export function getSvgContentBBox(svg) {
  if (!svg) return null;

  const metaBox = measureMetaTextBBox(svg);
  const staffBox = measureStaffContentBBox(svg);
  let contentBox = unionBoxes(metaBox, staffBox);

  if (!contentBox) {
    const envelope = readAbcjsNativeEnvelope(svg);
    if (envelope) return envelope;
    if (typeof svg.getBBox === 'function') {
      try {
        const rootBox = svg.getBBox();
        if (rootBox && rootBox.width > 0 && rootBox.height > 0) {
          return {
            x: rootBox.x,
            y: rootBox.y,
            width: rootBox.width,
            height: rootBox.height,
          };
        }
      } catch (e) {}
    }
    return null;
  }

  const envelope = readAbcjsNativeEnvelope(svg);
  if (envelope) {
    // Never crop above abcjs' own layout box — meta text lives in the top margin.
    if (contentBox.y > envelope.y + 1) {
      const extraTop = contentBox.y - envelope.y;
      contentBox = {
        x: Math.min(contentBox.x, envelope.x),
        y: envelope.y,
        width: Math.max(contentBox.x + contentBox.width, envelope.x + envelope.width) - Math.min(contentBox.x, envelope.x),
        height: contentBox.height + extraTop,
      };
    }
    const contentBottom = contentBox.y + contentBox.height;
    const envelopeBottom = envelope.y + envelope.height;
    if (contentBottom < envelopeBottom - 1) {
      contentBox = Object.assign({}, contentBox, {
        height: contentBox.height + (envelopeBottom - contentBottom),
      });
    }
  }

  return contentBox;
}

export function buildFitFrame(contentBox) {
  if (!contentBox || !(contentBox.width > 0) || !(contentBox.height > 0)) {
    return null;
  }
  const padX = GIG_NOTATION_FRAME_PAD_X;
  const padTop = GIG_NOTATION_FRAME_PAD_TOP;
  const padBottom = GIG_NOTATION_FRAME_PAD_BOTTOM;
  return {
    x: contentBox.x - padX,
    y: contentBox.y - padTop,
    width: contentBox.width + (padX * 2),
    height: contentBox.height + padTop + padBottom,
  };
}

export function measureFitFrame(svg) {
  return buildFitFrame(getSvgContentBBox(svg));
}

export function readSvgViewBox(svg) {
  if (!svg) return null;
  const parsed = svg.viewBox && svg.viewBox.baseVal;
  if (parsed && parsed.width > 0 && parsed.height > 0) {
    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
    };
  }
  const raw = svg.getAttribute('viewBox');
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(function(n) { return !Number.isFinite(n); })) return null;
  if (!(parts[2] > 0) || !(parts[3] > 0)) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

export function applyFitViewBox(svg, frame) {
  if (!svg || !frame) return null;
  const viewBox = [frame.x, frame.y, frame.width, frame.height].join(' ');
  svg.setAttribute('viewBox', viewBox);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return { width: frame.width, height: frame.height };
}

export function getFitDimensionsFromFrame(frame) {
  if (!frame) return { width: 0, height: 0 };
  return { width: frame.width, height: frame.height };
}

export function getRenderDimensions(svg) {
  const frame = measureFitFrame(svg);
  return getFitDimensionsFromFrame(frame);
}

export function getTightSvgDimensions(svg) {
  const frame = measureFitFrame(svg);
  if (!frame) return { width: 0, height: 0 };
  applyFitViewBox(svg, frame);
  return getFitDimensionsFromFrame(frame);
}

/**
 * Shrink abcjs title / subtitle / composer for on-screen display.
 * Print/PDF uses TunePrintSheet HTML headers (and strips T:), so leave those paths alone.
 * Pass as renderAbc `afterParsing` so spacing lands on tune.formatting before engrave.
 */
export function applyCompactScreenNotationMeta(tune) {
  if (!tune || !tune.formatting) return;
  const f = tune.formatting;
  const face = (f.titlefont && f.titlefont.face) || '"Times New Roman"';
  f.titlefont = {
    face: face,
    size: 14,
    weight: (f.titlefont && f.titlefont.weight) || 'normal',
    style: 'normal',
    decoration: 'none',
  };
  f.subtitlefont = {
    face: (f.subtitlefont && f.subtitlefont.face) || face,
    size: 12,
    weight: 'normal',
    style: 'normal',
    decoration: 'none',
  };
  f.composerfont = {
    face: (f.composerfont && f.composerfont.face) || face,
    size: 11,
    weight: 'normal',
    style: 'italic',
    decoration: 'none',
  };
  f.titlespace = 0;
  f.composerspace = 0.5;
  f.subtitlespace = 0;
  f.musicspace = 2;
  f.topspace = 0;
}

export function buildGigNotationRenderOptions(visualTranspose) {
  return {
    visualTranspose: visualTranspose,
    foregroundColor: '#111111',
    add_classes: true,
    paddingtop: 12,
    paddingbottom: 16,
    paddingleft: 12,
    paddingright: 12,
    topmargin: 0,
    bottommargin: 0,
    stafftopmargin: 4,
    staffbottommargin: 6,
    minPadding: 0,
    musicspace: 2,
  };
}

export function verticalFitTargetHeight(availH) {
  return Math.max(50, availH - GIG_NOTATION_FIT_SAFETY_PX);
}

export function horizontalFitTargetWidth(availW) {
  return Math.max(50, availW - GIG_NOTATION_FIT_SAFETY_PX);
}

export function horizontalScaledHeight(dims, availW) {
  if (!dims || !(dims.width > 0) || !(availW > 0)) return Infinity;
  const targetW = horizontalFitTargetWidth(availW);
  return dims.height * (targetW / dims.width);
}

/** Display width when the score is scaled to fill available height. */
export function verticalScaledWidth(dims, availH) {
  if (!dims || !(dims.height > 0) || !(availH > 0)) return Infinity;
  const targetH = verticalFitTargetHeight(availH);
  return dims.width * (targetH / dims.height);
}

/**
 * Pick a staffwidth for height-fit. Starts at page width (preserves normal
 * multi-line layout) and only narrows when height-scaling would overflow
 * horizontally. Never widens past the page — that produced one long system.
 */
export function findStaffWidthForVerticalFit(renderFn, availW, availH, initialStaffWidth) {
  const targetW = horizontalFitTargetWidth(availW);
  const startWidth = Math.max(
    GIG_NOTATION_MIN_STAFF_WIDTH,
    Math.min(initialStaffWidth || targetW, targetW)
  );
  const startResult = renderFn(startWidth);
  if (!startResult || !(startResult.dims.width > 0) || !(startResult.dims.height > 0)) {
    return {
      staffWidth: GIG_NOTATION_MIN_STAFF_WIDTH,
      dims: { width: 0, height: 0 },
      scaledW: Infinity,
    };
  }

  const startScaledW = verticalScaledWidth(startResult.dims, availH);
  const best = {
    staffWidth: startWidth,
    dims: startResult.dims,
    scaledW: startScaledW,
  };

  // Already fits when scaled to height — keep page-width layout.
  if (startScaledW <= targetW) {
    return best;
  }

  // Height-fit is wider than the page — narrow staff (more wraps) until it fits.
  let searchLow = GIG_NOTATION_MIN_STAFF_WIDTH;
  let searchHigh = startWidth - 1;
  let narrowed = null;

  for (let attempt = 0; attempt < 14 && searchLow <= searchHigh; attempt += 1) {
    const mid = Math.max(GIG_NOTATION_MIN_STAFF_WIDTH, Math.floor((searchLow + searchHigh) / 2));
    const midResult = renderFn(mid);
    if (!midResult || !(midResult.dims.width > 0) || !(midResult.dims.height > 0)) {
      searchHigh = mid - 1;
      continue;
    }
    const scaledW = verticalScaledWidth(midResult.dims, availH);
    if (scaledW <= targetW) {
      narrowed = { staffWidth: mid, dims: midResult.dims, scaledW: scaledW };
      searchLow = mid + 1;
    } else {
      searchHigh = mid - 1;
    }
  }

  if (narrowed) return narrowed;

  return {
    staffWidth: GIG_NOTATION_MIN_STAFF_WIDTH,
    dims: startResult.dims,
    scaledW: startScaledW,
  };
}

/**
 * Scale notation to fill page width (horizontal) or page height (vertical).
 * Horizontal: tall scores scroll vertically.
 * Vertical: wide scores scroll horizontally.
 */
export function computeNotationFit(dims, mode, availW, availH) {
  if (!dims || !(dims.width > 0) || !(dims.height > 0)) {
    return null;
  }
  if (!(availW > 0) || !(availH > 0)) return null;

  if (mode === NOTATION_FIT_VERTICAL) {
    const targetH = verticalFitTargetHeight(availH);
    const width = dims.width * (targetH / dims.height);
    return {
      mode: NOTATION_FIT_VERTICAL,
      width: width,
      height: targetH,
      overflowX: width > availW + 1,
      overflowY: false,
    };
  }

  const width = horizontalFitTargetWidth(availW);
  const height = dims.height * (width / dims.width);
  return {
    mode: NOTATION_FIT_HORIZONTAL,
    width: width,
    height: height,
    overflowX: false,
    overflowY: height > verticalFitTargetHeight(availH) + 1,
  };
}

export function findStaffWidthForHorizontalFit(renderFn, availW, availH, initialStaffWidth) {
  const targetW = horizontalFitTargetWidth(availW);
  const targetH = verticalFitTargetHeight(availH);
  const startWidth = Math.max(GIG_NOTATION_MIN_STAFF_WIDTH, initialStaffWidth || targetW);
  const minStaffWidth = Math.max(
    GIG_NOTATION_MIN_STAFF_WIDTH,
    Math.floor(targetW * GIG_NOTATION_HFILL_MIN_STAFF_FRACTION)
  );

  const startResult = renderFn(startWidth);
  if (!startResult || !(startResult.dims.width > 0)) {
    return {
      staffWidth: GIG_NOTATION_MIN_STAFF_WIDTH,
      dims: { width: 0, height: 0 },
      scaledH: Infinity,
    };
  }

  const startScaledH = horizontalScaledHeight(startResult.dims, availW);
  if (startScaledH >= targetH) {
    return { staffWidth: startWidth, dims: startResult.dims, scaledH: startScaledH };
  }

  let searchLow = minStaffWidth;
  let searchHigh = startWidth - 1;
  let best = { staffWidth: startWidth, dims: startResult.dims, scaledH: startScaledH };

  for (let attempt = 0; attempt < 14 && searchLow <= searchHigh; attempt += 1) {
    const mid = Math.max(minStaffWidth, Math.floor((searchLow + searchHigh) / 2));
    const midResult = renderFn(mid);
    if (!midResult || !(midResult.dims.width > 0)) {
      searchLow = mid + 1;
      continue;
    }
    const scaledH = horizontalScaledHeight(midResult.dims, availW);
    if (scaledH <= targetH) {
      best = { staffWidth: mid, dims: midResult.dims, scaledH: scaledH };
      searchLow = mid + 1;
    } else {
      searchHigh = mid - 1;
    }
  }

  return best;
}

export function resetSvgInlineSize(svg) {
  if (!svg) return;
  svg.style.transform = '';
  svg.style.width = '';
  svg.style.height = '';
  svg.style.maxWidth = '';
  svg.style.maxHeight = '';
  svg.style.display = '';
  svg.style.margin = '';
}

export function applyNotationFit(svg, renderEl, fitResult) {
  if (!svg || !renderEl || !fitResult) return;
  resetSvgInlineSize(svg);
  svg.style.width = fitResult.width + 'px';
  svg.style.height = fitResult.height + 'px';
  svg.style.maxWidth = 'none';
  svg.style.maxHeight = 'none';

  renderEl.classList.remove('gig-mode-notation-render--fit-vertical');
  renderEl.classList.remove('gig-mode-notation-render--fit-horizontal');
  renderEl.classList.remove('gig-mode-notation-render--fit-width');
  renderEl.classList.remove('gig-mode-notation-render--wide');
  renderEl.classList.remove('gig-mode-notation-render--scroll-y');
  if (fitResult.mode === NOTATION_FIT_VERTICAL) {
    renderEl.classList.add('gig-mode-notation-render--fit-vertical');
    renderEl.style.overflowY = 'hidden';
    renderEl.style.overflowX = fitResult.overflowX ? 'auto' : 'hidden';
    renderEl.classList.toggle('gig-mode-notation-render--wide', !!fitResult.overflowX);
  } else {
    renderEl.classList.add('gig-mode-notation-render--fit-width');
    renderEl.style.overflowX = 'hidden';
    renderEl.style.overflowY = fitResult.overflowY ? 'auto' : 'hidden';
    renderEl.classList.toggle('gig-mode-notation-render--scroll-y', !!fitResult.overflowY);
  }
}

export function clearNotationFit(svg, renderEl) {
  if (svg) resetSvgInlineSize(svg);
  if (!renderEl) return;
  renderEl.classList.remove('gig-mode-notation-render--fit-vertical');
  renderEl.classList.remove('gig-mode-notation-render--fit-horizontal');
  renderEl.classList.remove('gig-mode-notation-render--fit-width');
  renderEl.classList.remove('gig-mode-notation-render--wide');
  renderEl.classList.remove('gig-mode-notation-render--scroll-y');
  renderEl.style.overflowX = '';
  renderEl.style.overflowY = '';
  renderEl.style.maxHeight = '';
  renderEl.style.height = '';
  renderEl.style.width = '';
  renderEl.style.maxWidth = '';
  renderEl.style.display = '';
  renderEl.style.boxSizing = '';
}

/** Space reserved so a horizontal scrollbar does not clip the bottom of the score. */
export const SINGLE_VIEW_SCROLLBAR_RESERVE_PX = 18;

/**
 * Available paper for single-view notation.
 * Width prefers the viewer element (inside column padding) so the scaled SVG
 * does not overflow and left-align-clip the title. Falls back to the notation
 * column when the viewer has not laid out yet. Height is from the score top to
 * the bottom of the viewport.
 */
export function measureSingleViewPaper(renderEl) {
  if (!renderEl) return { availW: 100, availH: 100 };
  const column = typeof renderEl.closest === 'function'
    ? renderEl.closest(
      '.tune-panel-notation, .music-body-notation, .music-notation-section, .music-view-notation, .gig-mode-notation-col, .music-view-main'
    )
    : null;
  const widthEl = column || renderEl;
  const widthRect = widthEl.getBoundingClientRect();
  const topRect = renderEl.getBoundingClientRect();
  const rightPad = 8;
  const bottomPad = 8;
  const columnW = Math.max(
    widthEl.clientWidth || 0,
    widthRect.width || 0
  );
  // Viewer width accounts for MusicSingle's padded wrapper; column width does not.
  const renderW = Math.max(
    renderEl.clientWidth || 0,
    topRect.width || 0
  );
  const baseW = renderW > 40 ? Math.min(renderW, columnW || renderW) : columnW;
  const availW = Math.max(100, Math.floor(baseW - rightPad));
  const availH = Math.max(
    100,
    Math.floor(window.innerHeight - topRect.top - bottomPad)
  );
  return { availW: availW, availH: availH };
}

/**
 * Native abcjs SVG size in user units. Does not crop to a content bbox — cropping
 * was clipping notes on the right and bottom in single view.
 */
export function readNotationSvgDims(svg) {
  if (!svg) return null;
  const viewBox = readSvgViewBox(svg);
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const envelope = readAbcjsNativeEnvelope(svg);
  if (envelope && envelope.width > 0 && envelope.height > 0) {
    return envelope;
  }
  return null;
}

/**
 * Expand the native abcjs envelope so long centered titles (text-anchor middle)
 * are not clipped when fit-height sets overflow:hidden. Never shrinks the
 * staff envelope — only grows for meta overhang.
 */
export function expandNotationViewBoxForMeta(svg, dims) {
  if (!dims || !(dims.width > 0) || !(dims.height > 0)) return null;
  const existing = readSvgViewBox(svg);
  let box = existing && existing.width > 0 && existing.height > 0
    ? { x: existing.x, y: existing.y, width: existing.width, height: existing.height }
    : { x: 0, y: 0, width: dims.width, height: dims.height };

  const meta = measureMetaTextBBox(svg);
  if (meta) {
    box = unionBoxes(box, meta);
  }

  const padX = GIG_NOTATION_FRAME_PAD_X;
  return {
    x: box.x - padX,
    y: box.y,
    width: box.width + (padX * 2),
    height: box.height,
  };
}

function applyVerticalFitViewBox(svg, frame) {
  if (!svg || !frame) return;
  svg.setAttribute('viewBox', [frame.x, frame.y, frame.width, frame.height].join(' '));
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

/**
 * Scale notation into the viewport. Prefers filling the full height; if the
 * score is still too wide, falls back to contain so every note stays visible.
 * When paperEl is set (gig mode), measure from that container instead of the window.
 */
export function fitSingleViewVertical(svg, renderEl, paperEl) {
  if (!svg || !renderEl) return null;
  const dims = readNotationSvgDims(svg);
  if (!dims) return null;
  // Measure meta while native width/height are still present for bbox conversion.
  const frame = expandNotationViewBoxForMeta(svg, dims) || {
    x: 0,
    y: 0,
    width: dims.width,
    height: dims.height,
  };
  applyVerticalFitViewBox(svg, frame);

  const paper = paperEl
    ? measureNotationPaper(paperEl, renderEl)
    : measureSingleViewPaper(renderEl);
  const targetH = verticalFitTargetHeight(paper.availH);
  const targetW = horizontalFitTargetWidth(paper.availW);
  const scaleH = targetH / frame.height;
  const scaleW = targetW / frame.width;
  // Prefer full height when it still fits width; otherwise contain.
  const scale = Math.min(scaleH, scaleW);
  const width = frame.width * scale;
  const height = frame.height * scale;

  resetSvgInlineSize(svg);
  svg.style.width = width + 'px';
  svg.style.height = height + 'px';
  svg.style.maxWidth = 'none';
  svg.style.maxHeight = 'none';
  svg.style.display = 'block';
  svg.style.margin = '0 auto';

  renderEl.classList.remove('gig-mode-notation-render--fit-horizontal');
  renderEl.classList.remove('gig-mode-notation-render--fit-width');
  renderEl.classList.remove('gig-mode-notation-render--scroll-y');
  renderEl.classList.remove('gig-mode-notation-render--wide');
  renderEl.classList.add('gig-mode-notation-render--fit-vertical');
  renderEl.style.display = 'block';
  renderEl.style.width = '100%';
  renderEl.style.maxWidth = '100%';
  renderEl.style.boxSizing = 'border-box';
  renderEl.style.height = paper.availH + 'px';
  renderEl.style.maxHeight = paper.availH + 'px';
  renderEl.style.overflowX = 'hidden';
  renderEl.style.overflowY = 'hidden';

  return {
    mode: NOTATION_FIT_VERTICAL,
    width: width,
    height: height,
    overflowX: false,
    overflowY: false,
    fillsHeight: scale >= scaleH - 1e-6,
  };
}

export function refitNotationSvg(svg, renderEl, paperEl, mode) {
  if (!svg || !renderEl) return null;
  if (mode === NOTATION_FIT_VERTICAL) {
    return fitSingleViewVertical(svg, renderEl, paperEl);
  }
  const paper = measureNotationPaper(paperEl, renderEl);
  return refitNotationToWidth(svg, renderEl, paper.availW);
}

/**
 * Fit notation to column width; height follows content. Tall scores scroll with
 * the page (fit-height off), not inside a clipped viewport box.
 */
function clearRenderElFitStyles(renderEl) {
  if (!renderEl) return;
  renderEl.style.display = '';
  renderEl.style.width = '';
  renderEl.style.maxWidth = '';
  renderEl.style.height = '';
  renderEl.style.maxHeight = '';
  renderEl.style.boxSizing = '';
}

export function fitNotationToWidth(svg, renderEl, availW) {
  if (!svg || !renderEl) return null;
  const frame = measureFitFrame(svg);
  if (!frame) return null;
  const dims = applyFitViewBox(svg, frame);
  if (!dims) return null;
  const width = horizontalFitTargetWidth(availW);
  const height = dims.height * (width / dims.width);
  clearRenderElFitStyles(renderEl);
  applyNotationFit(svg, renderEl, {
    mode: NOTATION_FIT_HORIZONTAL,
    width: width,
    height: height,
    overflowX: false,
    overflowY: false,
  });
  renderEl.style.overflowX = 'visible';
  renderEl.style.overflowY = 'visible';
  renderEl.classList.remove('gig-mode-notation-render--scroll-y');
  return { width: width, height: height };
}

export function refitNotationToWidth(svg, renderEl, availW) {
  if (!svg || !renderEl) return null;
  const viewBox = readSvgViewBox(svg);
  if (!viewBox) return null;
  const dims = { width: viewBox.width, height: viewBox.height };
  const width = horizontalFitTargetWidth(availW);
  const height = dims.height * (width / dims.width);
  clearRenderElFitStyles(renderEl);
  applyNotationFit(svg, renderEl, {
    mode: NOTATION_FIT_HORIZONTAL,
    width: width,
    height: height,
    overflowX: false,
    overflowY: false,
  });
  renderEl.style.overflowX = 'visible';
  renderEl.style.overflowY = 'visible';
  renderEl.classList.remove('gig-mode-notation-render--scroll-y');
  return { width: width, height: height };
}

export function fitNotationSvg(svg, renderEl, paperEl, mode) {
  if (!svg || !renderEl) return null;
  if (mode === NOTATION_FIT_VERTICAL) {
    return fitSingleViewVertical(svg, renderEl, paperEl);
  }
  const paper = measureNotationPaper(paperEl, renderEl);
  return fitNotationToWidth(svg, renderEl, paper.availW);
}
