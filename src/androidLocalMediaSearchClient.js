import { TunebookLocalMedia } from './capacitor/tunebookPlugins';
import { isAndroidApp } from './platformUtils';
import { scoreTitleArtistMatch } from './notationMatchUtils';

export const MAX_LOCAL_AUDIO_SEARCH_RESULTS = 20;

function collectCandidates(result) {
  if (result && Array.isArray(result.candidates)) return result.candidates;
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

export function isAndroidLocalMediaAvailable() {
  return isAndroidApp();
}

export async function requestAndroidAudioPermission() {
  if (!isAndroidLocalMediaAvailable()) {
    return { granted: false, permission: '' };
  }
  try {
    return await TunebookLocalMedia.requestAudioPermission();
  } catch (e) {
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
