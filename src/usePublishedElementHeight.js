import { useLayoutEffect, useRef } from 'react';

function emptyAttachment() {
  return { node: null, host: null, observer: null, onResize: null };
}

let rectIncludesZoomCache = null;

/**
 * Some engines (e.g. Chromium 148) report getBoundingClientRect() of a CSS
 * `zoom`ed element in its own unzoomed units; others report page pixels.
 */
function rectIncludesZoom() {
  if (rectIncludesZoomCache !== null) return rectIncludesZoomCache;
  if (typeof document === 'undefined' || !document.body) return true;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:10px;height:10px;zoom:2';
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  document.body.removeChild(probe);
  if (!(width > 0)) return true;
  rectIncludesZoomCache = width > 15;
  return rectIncludesZoomCache;
}

function effectiveZoom(node) {
  let zoom = 1;
  for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
    const value = parseFloat(window.getComputedStyle(el).zoom);
    if (value > 0) zoom *= value;
  }
  return zoom;
}

/** Element rect in page CSS pixels regardless of how the engine reports zoom. */
export function pageRect(node) {
  const rect = node.getBoundingClientRect();
  if (rectIncludesZoom()) return rect;
  const zoom = effectiveZoom(node);
  if (Math.abs(zoom - 1) < 0.001) return rect;
  return {
    top: rect.top * zoom,
    bottom: rect.bottom * zoom,
    height: rect.height * zoom,
    width: rect.width * zoom,
  };
}

/**
 * Publish an element's rendered height (or bottom edge) in px as a CSS custom
 * property on a host element, re-measuring on resize. Measured values already
 * include any CSS `zoom` on the element.
 *
 * options.varName  custom property name, e.g. '--music-buttons-measured-height'
 * options.host     function(node) returning the element that receives the property
 * options.edge     'height' (default) or 'bottom'
 */
export default function usePublishedElementHeight(ref, options) {
  const attachedRef = useRef(emptyAttachment());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  function detach() {
    const attached = attachedRef.current;
    if (attached.observer) attached.observer.disconnect();
    if (attached.onResize) {
      window.removeEventListener('resize', attached.onResize);
      attached.onResize.cancel();
    }
    if (attached.host) attached.host.style.removeProperty(optionsRef.current.varName);
    attachedRef.current = emptyAttachment();
  }

  useLayoutEffect(function() {
    const opts = optionsRef.current;
    const node = ref && ref.current;
    const host = node ? opts.host(node) : null;
    const attached = attachedRef.current;
    if (node === attached.node && host === attached.host) return;
    detach();
    if (!node || !host) return;

    function measure() {
      const rect = pageRect(node);
      const value = opts.edge === 'bottom' ? rect.bottom : rect.height;
      if (value > 0) host.style.setProperty(opts.varName, value + 'px');
    }

    // Browser zoom fires resize before other listeners (e.g. the chrome zoom
    // guard) have restyled the element, so measure again on the next frame.
    let frame = 0;
    function onResize() {
      measure();
      if (typeof requestAnimationFrame !== 'function') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    onResize.cancel = function() {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };

    measure();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(node);
    }
    window.addEventListener('resize', onResize);
    attachedRef.current = { node: node, host: host, observer: observer, onResize: onResize };
  });

  useLayoutEffect(function() {
    return detach;
  }, []);
}
