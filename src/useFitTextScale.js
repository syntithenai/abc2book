import { useEffect, useRef, useState } from 'react';
import {
  measureElementViewportHeightBudget,
  measureViewportBottomLimit,
} from './gigNotationFit';

/**
 * Scale a content element's font so it fits inside a container.
 *
 * - fitHeight false: only grow/shrink to fill width of the longest unwrapped line
 *   (structure chord charts). Pass measureLongestLine=true.
 * - fitHeight true: binary-search a scale that fills height.
 *   Width is only enforced when measureLongestLine is set (structure).
 *   Lyrics wrap / may scroll horizontally — height is the fit target.
 *
 * @returns {{ containerRef, contentRef, fontScale, overflows }}
 *   Apply fontScale as style.fontSize = fontScale + 'em' (or %) on content.
 *   overflows is true when fitHeight is on but the full content still exceeds
 *   the panel at the chosen scale (eg. at minScale, or when
 *   fitHeightExcludeSelector sections extend past the fitted height).
 */
export function useFitTextScale(options) {
  const {
    deps,
    fitHeight,
    /** When true, measure longest nowrap line for width (structure). */
    measureLongestLine,
    minScale,
    maxScale,
    padX,
    padY,
    /** When set, width constraints use this column instead of the container. */
    widthColumnRef,
    /**
     * CSS selector for content children that should not count toward the
     * height fit (eg. heading-only stanzas that repeat a chart already shown).
     * They still render — overflows turns true when they extend past the panel.
     */
    fitHeightExcludeSelector,
  } = options || {};

  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [fontScale, setFontScale] = useState(1);
  const [overflows, setOverflows] = useState(false);

  const min = minScale > 0 ? minScale : 0.45;
  const max = maxScale > 0 ? maxScale : 3.5;
  const px = padX != null ? padX : 16;
  const py = padY != null ? padY : 16;
  const wantHeight = !!fitHeight;
  const wantLongest = !!measureLongestLine;
  const excludeSelector = fitHeightExcludeSelector || '';

  useEffect(function() {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    let cancelled = false;
    let raf = null;

    function layoutColumn() {
      return typeof container.closest === 'function'
        ? container.closest('.tune-lyrics-structure-sync-structure, .tune-panel-structure, .music-chords-block-col, .music-body-chords')
        : null;
    }

    function columnWidth() {
      const widthCol = widthColumnRef && widthColumnRef.current;
      if (widthCol && widthCol.clientWidth > 0) {
        return widthCol.clientWidth;
      }
      const col = layoutColumn();
      const colW = col && col.clientWidth > 0 ? col.clientWidth : 0;
      const selfW = container.clientWidth || 0;
      if (colW > 0 && selfW > 0) return Math.min(colW, selfW);
      return colW || selfW;
    }

    /**
     * Stable vertical budget for sticky structure panels.
     * Uses the configured sticky `top` — not getBoundingClientRect — so scroll
     * does not change the fit target or zoom the chord text.
     */
    function structurePanelBudget(col) {
      if (!col || typeof window.getComputedStyle !== 'function') {
        return Math.max(40, container.clientHeight || 0);
      }
      const style = window.getComputedStyle(col);
      const stickyTop = parseFloat(style.top);
      if (style.position === 'sticky' && !isNaN(stickyTop) && stickyTop >= 0) {
        return Math.max(40, measureViewportBottomLimit() - stickyTop - 12);
      }
      const maxHeight = parseFloat(style.maxHeight);
      if (!isNaN(maxHeight) && maxHeight > 0 && isFinite(maxHeight)) {
        return maxHeight;
      }
      if (col.clientHeight > 80) return col.clientHeight;
      return Math.max(40, measureViewportBottomLimit() - 96);
    }

    /**
     * Lyrics panels often use an oversized CSS height (nearly 100dvh while
     * already below chrome). Cap with the on-screen remaining viewport so
     * fit/scroll target the visible area, not the off-screen panel bottom.
     */
    function lyricsHeightBudget() {
      const visibleH = measureElementViewportHeightBudget(container, 4);
      const selfH = container.clientHeight || 0;
      if (visibleH > 0 && selfH > 0) return Math.min(selfH, visibleH);
      return visibleH || selfH || 40;
    }

    function availableSize() {
      const availW = Math.max(40, columnWidth() - px);
      let availH = Math.max(40, (container.clientHeight || 0) - py);
      if (!wantHeight) {
        return { availW: availW, availH: availH };
      }

      const col = layoutColumn();
      const inFitHost = col && col.closest('.tune-lyrics-structure-sync-host--fit-height');
      if (inFitHost && col.clientHeight > 80) {
        const visibleH = measureElementViewportHeightBudget(container, 4);
        const colH = col.clientHeight;
        availH = Math.max(40, Math.min(colH, visibleH || colH) - py);
      } else if (col) {
        availH = Math.max(40, structurePanelBudget(col) - py);
      } else {
        availH = Math.max(40, lyricsHeightBudget() - py);
      }

      Array.prototype.forEach.call(container.children, function(child) {
        if (child !== content) {
          availH -= child.offsetHeight || 0;
        }
      });
      availH = Math.max(40, availH);
      return { availW: availW, availH: availH };
    }

    function constrainLyricsScrollport() {
      if (!wantHeight || layoutColumn()) {
        container.style.maxHeight = '';
        return;
      }
      const visibleH = measureElementViewportHeightBudget(container, 4);
      if (visibleH > 0) {
        container.style.maxHeight = visibleH + 'px';
      }
    }

    function longestLineWidthAt(scaleEm) {
      let longest = '';
      let sampleEl = null;
      const lines = content.querySelectorAll('.chord-block-line, .chord-chart-line, .chordpro-line, .lyrics-line');
      if (lines.length > 0) {
        lines.forEach(function(el) {
          const t = (el.textContent || '').trim();
          if (t.length > longest.length) {
            longest = t;
            sampleEl = el;
          }
        });
      }
      if (!longest) {
        longest = (content.textContent || '').split('\n').reduce(function(a, b) {
          return a.length >= b.length ? a : b;
        }, '');
      }
      if (!longest) return 0;

      const styleSrc = sampleEl || content;
      const cs = window.getComputedStyle(styleSrc);
      const probe = document.createElement('span');
      probe.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'left:0',
        'top:0',
        'white-space:nowrap',
        'pointer-events:none',
        'font-family:' + cs.fontFamily,
        'font-weight:' + cs.fontWeight,
        'font-style:' + cs.fontStyle,
        'letter-spacing:' + cs.letterSpacing,
        'word-spacing:' + cs.wordSpacing,
      ].join(';');
      probe.style.fontSize = scaleEm + 'em';
      probe.textContent = longest;
      container.appendChild(probe);
      const w = probe.offsetWidth;
      container.removeChild(probe);
      return w;
    }

    function fitsAt(scale) {
      content.style.fontSize = scale + 'em';
      const size = availableSize();
      let widthOk = true;
      if (wantLongest) {
        const lineW = Math.max(longestLineWidthAt(scale), content.scrollWidth || 0);
        widthOk = !(lineW > 0) || lineW <= size.availW + 2;
      } else if (!wantHeight) {
        widthOk = content.scrollWidth <= size.availW + 2;
      }
      if (!wantHeight) {
        return { ok: widthOk, size: size };
      }
      let excludedH = 0;
      if (excludeSelector) {
        content.querySelectorAll(excludeSelector).forEach(function(el) {
          excludedH += el.offsetHeight || 0;
        });
      }
      const rawHeightOk = content.scrollHeight <= size.availH + 2;
      const heightOk = (content.scrollHeight - excludedH) <= size.availH + 2;
      return {
        ok: widthOk && heightOk,
        size: size,
        widthOk: widthOk,
        heightOk: heightOk,
        rawHeightOk: rawHeightOk,
      };
    }

    function recalc() {
      if (cancelled || !containerRef.current || !contentRef.current) return;
      constrainLyricsScrollport();
      const size = availableSize();
      if (!(size.availW > 0) && !wantHeight) return;
      if (wantHeight && !(size.availH > 0)) return;

      var lo = min;
      var hi = max;
      var best = min;
      content.style.fontSize = '1em';
      for (var i = 0; i < 22; i++) {
        var mid = (lo + hi) / 2;
        var result = fitsAt(mid);
        if (result.ok) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      content.style.fontSize = best.toFixed(3) + 'em';
      const finalFit = fitsAt(best);
      setFontScale(Number(best.toFixed(3)));
      setOverflows(wantHeight && !finalFit.rawHeightOk);
    }

    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function() {
        raf = requestAnimationFrame(recalc);
      });
    }

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    const col = layoutColumn();
    if (col && col !== container) observer.observe(col);
    window.addEventListener('resize', schedule);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule);
    }
    return function() {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', schedule);
      }
      container.style.maxHeight = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantHeight, wantLongest, min, max, px, py, widthColumnRef, excludeSelector].concat(deps || []));

  return { containerRef: containerRef, contentRef: contentRef, fontScale: fontScale, overflows: overflows };
}
