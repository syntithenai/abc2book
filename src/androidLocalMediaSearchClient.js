import { TunebookLocalMedia } from './capacitor/tunebookPlugins';
import { isAndroidApp } from './platformUtils';
import { scoreTitleArtistMatch } from './notationMatchUtils';

export const MAX_LOCAL_AUDIO_SEARCH_RESULTS = 20;

let permissionCache = { granted: null, checkedAt: 0 };
const PERMISSION_CACHE_MS = 30000;

function collectCandidates(result) {
  if (!result) return [];
  const raw = result.candidates;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (typeof raw.length === 'number') {
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] != null) out.push(raw[i]);
      }
      return out;
    }
    return Object.keys(raw)
      .filter(function(key) { return /^\d+$/.test(key); })
      .sort(function(a, b) { return Number(a) - Number(b); })
      .map(function(key) { return raw[key]; })
      .filter(Boolean);
  }
  return [];
}

function withComputedMatchScores(candidates, query) {
  const q = String(query || '').trim();
  return candidates.map(function(candidate) {
    if (!candidate) return candidate;
    if (Number(candidate.matchScore) > 0) return candidate;
    const computed = scoreTitleArtistMatch(
      candidate.title,
      candidate.artist,
      q,
      ''
    );
    if (!computed) return candidate;
    return Object.assign({}, candidate, { matchScore: computed });
  });
}

export function invalidateAndroidAudioPermissionCache() {
  permissionCache = { granted: null, checkedAt: 0 };
}

async function hasAndroidAudioPermissionCached() {
  if (!isAndroidLocalMediaAvailable()) return false;
  const now = Date.now();
  if (permissionCache.granted !== null
      && (now - permissionCache.checkedAt) < PERMISSION_CACHE_MS) {
    return permissionCache.granted;
  }
  try {
    const stats = await TunebookLocalMedia.getLocalAudioStats();
    const granted = !!(stats && stats.granted);
    permissionCache = { granted: granted, checkedAt: now };
    return granted;
  } catch (e) {
    permissionCache = { granted: false, checkedAt: now };
    return false;
  }
}

export function isAndroidLocalMediaAvailable() {
  return isAndroidApp();
}

export async function requestAndroidAudioPermission() {
  if (!isAndroidLocalMediaAvailable()) {
    return { granted: false, permission: '' };
  }
  try {
    const result = await TunebookLocalMedia.requestAudioPermission();
    invalidateAndroidAudioPermissionCache();
    return result;
  } catch (e) {
    invalidateAndroidAudioPermissionCache();
    return { granted: false, permission: '', error: e && e.message ? e.message : String(e) };
  }
}

export async function getAndroidLocalAudioStats() {
  if (!isAndroidLocalMediaAvailable()) {
    return { granted: false, trackCount: 0, lastScanAt: 0 };
  }
  try {
    return await TunebookLocalMedia.getLocalAudioStats();
  } catch (e) {
    return { granted: false, trackCount: 0, lastScanAt: 0, error: e && e.message ? e.message : String(e) };
  }
}

export async function openAndroidAudioPermissionSettings() {
  if (!isAndroidLocalMediaAvailable()) return;
  try {
    await TunebookLocalMedia.openPermissionSettings();
  } catch (e) { /* ignore */ }
}

export async function searchAndroidLocalAudio(options) {
  const opts = options || {};
  const query = String(opts.query || opts.title || '').trim();
  if (!query || !isAndroidLocalMediaAvailable()) {
    return { empty: true, candidates: [] };
  }
  const granted = await hasAndroidAudioPermissionCached();
  if (!granted) {
    return { empty: true, candidates: [], needsPermission: true };
  }
  const limit = Math.min(
    Number(opts.maxResults || opts.limit) || MAX_LOCAL_AUDIO_SEARCH_RESULTS,
    MAX_LOCAL_AUDIO_SEARCH_RESULTS
  );
  try {
    const result = await TunebookLocalMedia.searchLocalAudio({
      query: query,
      limit: limit,
    });
    let candidates = collectCandidates(result).map(function(candidate) {
      return Object.assign({}, candidate, { source: 'device-file' });
    });
    candidates = withComputedMatchScores(candidates, query);
    if (!candidates.length) return { empty: true, candidates: [] };
    return { empty: false, candidates: candidates };
  } catch (e) {
    return { empty: true, candidates: [], error: e && e.message ? e.message : String(e) };
  }
}

export async function openAndroidAudioFileForImport(uri) {
  if (!isAndroidLocalMediaAvailable() || !uri) {
    throw new Error('Local media import is only available in the Android app');
  }
  return TunebookLocalMedia.openAudioFileForImport({ uri: uri });
}
