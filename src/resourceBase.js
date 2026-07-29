import { isCapacitorNative } from './platformUtils';

const DEFAULT_NATIVE_RESOURCE_BASE = 'https://tunebook.net';

export function getResourceBase() {
  const fromEnv = process.env.REACT_APP_RESOURCE_BASE;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim().replace(/\/$/, '');
  }
  // npm start proxies /scrape, /abcresources, etc. to the resolver on 8787.
  if (process.env.NODE_ENV === 'development') {
    return '';
  }
  // Capacitor serves the bundle from https://localhost — curated scrape/*.abc
  // files live on tunebook.net, not inside the APK.
  if (isCapacitorNative()) {
    return DEFAULT_NATIVE_RESOURCE_BASE;
  }
  return '';
}

export function resourceUrl(path) {
  const base = getResourceBase();
  const suffix = String(path || '').replace(/^\//, '');
  if (!base) {
    return suffix ? '/' + suffix : '';
  }
  return suffix ? base + '/' + suffix : base;
}

/** Full URL or same-origin path for a curated scrape/*.abc import source. */
export function curatedScrapeUrl(filename) {
  const name = String(filename || '').trim();
  if (!name) return '';
  if (/^https?:\/\//i.test(name)) return name;
  if (name.startsWith('/')) return name;
  if (name.startsWith('scrape/')) return resourceUrl(name);
  return resourceUrl('scrape/' + name);
}
