import { useEffect, useRef, useState } from 'react';

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
 *   overflows is true when fitHeight is on but content still exceeds the panel at minScale.
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

  useEffect(function() {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    let cancelled = false;
    let raf = null;

    function columnWidth() {
      const widthCol = widthColumnRef && widthColumnRef.current;
      if (widthCol && widthCol.clientWidth > 0) {
        return widthCol.clientWidth;
      }
      // Prefer the layout column width so a content-sized container cannot
      // inflate availW and skip shrinking (which clips on the right).
      const col = typeof container.closest === 'function'
        ? container.closest('.tune-lyrics-structure-sync-structure, .tune-panel-structure, .music-chords-block-col, .music-body-chords')
        : null;
      const colW = col && col.clientWidth > 0 ? col.clientWidth : 0;
      const selfW = container.clientWidth || 0;
      if (colW > 0 && selfW > 0) return Math.min(colW, selfW);
      return colW || selfW;
    }

    function availableSize() {
      const availW = Math.max(40, columnWidth() - px);
      let availH = Math.max(40, (container.clientHeight || 0) - py);
      if (!wantHeight) {
        return { availW: availW, availH: availH };
      }

      const top = container.getBoundingClientRect().top;
      const viewportH = Math.max(40, window.innerHeight - top - 12 - py);

      // Prefer the visible viewport remainder so we fill what the user sees,
      // not an oversized panel that extends below the fold.
      if (container.clientHeight > 80) {
        availH = Math.min(availH, viewportH);
        Array.prototype.forEach.call(container.children, function(child) {
          if (child !== content) {
            availH -= child.offsetHeight || 0;
          }
        });
        availH = Math.max(40, availH);
      } else {
        availH = viewportH;
      }
      return { availW: availW, availH: availH };
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

      // Match the real line font (monospace/bold), not the container's default.
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
      // Probe is parented on the container so em is relative to the same base
      // as content's fontScale (content.style.fontSize = N em).
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
      // Structure: keep longest chord line on one row.
      // Lyrics fit-height: ignore scrollWidth — nowrap/pre lines would otherwise
      // cap the scale and leave most of the panel empty.
      if (wantLongest) {
        // Prefer scrollWidth (includes padding) once the column is constrained;
        // probe covers the case where layout has not clipped yet.
        const lineW = Math.max(longestLineWidthAt(scale), content.scrollWidth || 0);
        widthOk = !(lineW > 0) || lineW <= size.availW + 2;
      } else if (!wantHeight) {
        widthOk = content.scrollWidth <= size.availW + 2;
      }
      if (!wantHeight) {
        return { ok: widthOk, size: size };
      }
      const heightOk = content.scrollHeight <= size.availH + 2;
      return { ok: widthOk && heightOk, size: size, widthOk: widthOk, heightOk: heightOk };
    }

    function recalc() {
      if (cancelled || !containerRef.current || !contentRef.current) return;
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
      setOverflows(wantHeight && !finalFit.heightOk);
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
    const col = typeof container.closest === 'function'
      ? container.closest('.tune-lyrics-structure-sync-structure, .tune-panel-structure, .music-chords-block-col, .music-body-chords')
      : null;
    if (col && col !== container) observer.observe(col);
    window.addEventListener('resize', schedule);
    return function() {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantHeight, wantLongest, min, max, px, py, widthColumnRef].concat(deps || []));

  return { containerRef: containerRef, contentRef: contentRef, fontScale: fontScale, overflows: overflows };
}
