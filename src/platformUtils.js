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
 * True when running inside a Capacitor native shell (Android/iOS app).
 */
export function isCapacitorNative() {
  if (typeof window === 'undefined') return false;
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return true;
  }
  // Capacitor Android WebView (androidScheme https → https://localhost).
  if (window.location
    && window.location.protocol === 'https:'
    && window.location.hostname === 'localhost') {
    return true;
  }
  return false;
}

/**
 * True when running as the Tunebook Android app (Capacitor on Android).
 */
export function isAndroidApp() {
  if (!isCapacitorNative()) return false;
  const cap = window.Capacitor;
  return cap.getPlatform && cap.getPlatform() === 'android';
}

/**
 * Prefer native ExoPlayer foreground-service playback on Android app builds.
 */
export function prefersNativeMediaPlayback() {
  return isAndroidApp();
}

/**
 * Google Cast Web Sender SDK (cast_sender.js) only works in desktop Chromium.
 * Capacitor WebView on Android/iOS cannot load the Cast framework.
 */
export function isCastWebSdkSupported() {
  if (isCapacitorNative()) return false;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/.test(ua)) return false;
  return true;
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
