import { isMobile } from 'react-device-detect';

/**
 * Platform detection for touch-first behavior that must not change when the
 * viewport is resized (e.g. tune-list filter chips disabled on phones/tablets).
 * For layout reflow, use useMediaQuery / CSS breakpoints instead.
 */
export function isMobilePlatform() {
  return isMobile;
}

/**
 * Desktop Chromium-based Google Chrome (not Edge, Opera, or mobile Chrome).
 * TuneBook Helper is a desktop Chrome extension.
 */
export function isChromiumDesktopBrowser() {
  if (isMobilePlatform()) return false;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Chrome\//.test(ua)
    && !/Edg\//.test(ua)
    && !/OPR\//.test(ua)
    && !/SamsungBrowser\//.test(ua);
}
