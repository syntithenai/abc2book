/** Chromecast resolver base URL helpers (health + Settings discovery). */

import { getActiveMediaProxyBase, getMediaProxyBase, getMediaProxyBaseCandidates } from './mediaProxyClient';
import { getSavedMediaProxyBase } from './mediaProxyConfig';

let castPublicBaseFromHealth = '';

export function normalizeCastBase(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/\/$/, '');
}

export function isLocalhostCastBase(base) {
  try {
    const host = new URL(base).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch (e) {
    return false;
  }
}

export function setCastPublicBaseFromHealth(base) {
  castPublicBaseFromHealth = normalizeCastBase(base);
}

export function getCastPublicBaseFromHealth() {
  return castPublicBaseFromHealth;
}

export function castPublicBaseFromHealthStatus(healthStatus) {
  if (!healthStatus || !healthStatus.cast || typeof healthStatus.cast !== 'object') {
    return '';
  }
  return normalizeCastBase(healthStatus.cast.publicBase);
}

function guessCastResolverBaseFromPage() {
  if (typeof window === 'undefined') return '';
  try {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    if (!hostname || isLocalhostCastBase(protocol + '//' + hostname)) return '';
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return protocol + '//' + hostname + ':8787';
  } catch (e) {
    return '';
  }
}

/**
 * Base URL Chromecast fetches HLS / proxy-audio from.
 * Prefer health-derived publicBase, then active media proxy, then saved Settings URL.
 */
export function resolveCastMediaBase(options) {
  const opts = options || {};
  if (opts.resolverBase) return normalizeCastBase(opts.resolverBase);

  const envBase = normalizeCastBase(process.env.REACT_APP_CAST_RESOLVER_BASE || '');
  if (envBase) return envBase;

  const healthStatus = opts.healthStatus || null;
  const healthBase = castPublicBaseFromHealthStatus(healthStatus) || castPublicBaseFromHealth;
  if (healthBase && !isLocalhostCastBase(healthBase)) return healthBase;

  const active = normalizeCastBase(getActiveMediaProxyBase());
  if (active && !isLocalhostCastBase(active)) return active;

  const saved = normalizeCastBase(getSavedMediaProxyBase());
  if (saved && !isLocalhostCastBase(saved)) return saved;

  const candidates = getMediaProxyBaseCandidates();
  for (let i = 0; i < candidates.length; i++) {
    const base = normalizeCastBase(candidates[i]);
    if (!base || isLocalhostCastBase(base)) continue;
    return base;
  }

  const guessed = guessCastResolverBaseFromPage();
  if (guessed) return guessed;

  return normalizeCastBase(getMediaProxyBase() || active || healthBase);
}

export function castHttpOnHttpsPageWarning(publicBase) {
  if (typeof window === 'undefined' || !publicBase) return '';
  try {
    if (window.location.protocol !== 'https:') return '';
    const url = new URL(publicBase);
    if (url.protocol === 'http:') {
      return 'Chromecast media base is HTTP but this page is HTTPS. Set CAST_PUBLIC_URL on your resolver.';
    }
  } catch (e) {
    return '';
  }
  return '';
}

export function getCastResolverBaseError(src, options) {
  if (!src) return 'No media source to cast';
  const base = resolveCastMediaBase(options);
  if (!base) {
    return 'No Cast media resolver found. Set a media resolver in Settings or REACT_APP_CAST_RESOLVER_BASE.';
  }
  const mixed = castHttpOnHttpsPageWarning(base);
  if (mixed) return mixed;
  if (isLocalhostCastBase(base)) {
    return 'Chromecast cannot reach localhost. Use a hosted resolver, set your LAN IP in REACT_APP_CAST_RESOLVER_BASE, or open Tune Book via your computer\'s network address.';
  }
  return 'Could not build Cast media URL';
}

export function castAvailableFromHealth(healthStatus) {
  return !!(healthStatus
    && healthStatus.cast
    && healthStatus.cast.enabled
    && healthStatus.cast.publicBase);
}
