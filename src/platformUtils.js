import { isMobile } from 'react-device-detect';

/**
 * Platform detection for touch-first behavior that must not change when the
 * viewport is resized (e.g. tune-list filter chips disabled on phones/tablets).
 * For layout reflow, use useMediaQuery / CSS breakpoints instead.
 */
export function isMobilePlatform() {
  return isMobile;
}
