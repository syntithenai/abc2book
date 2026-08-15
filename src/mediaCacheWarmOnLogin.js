import {
  getExternalMediaCacheKey,
  isExternalMediaCached,
} from './externalMediaAudioCache';
import {
  buildRecordingLinkUri,
  isOwnedMediaLink,
  getRecording,
  parseRecordingIdFromLinkUri,
  resolveRecordingLinkAudio,
  resolveRecordingLinkMidi,
} from './linkRecording';
import { isMidiOwnedMediaLink } from './midiFileUtils';

/**
 * Download owned audio/MIDI from Drive into externalmediacache after login.
 */
export async function warmOwnedMediaCacheOnLogin(tunes, options) {
  const opts = options || {};
  const driveApi = opts.driveApi;
  const accessToken = opts.accessToken
    || (opts.token && opts.token.access_token ? opts.token.access_token : null);
  if (!driveApi || !accessToken) {
    return { warmed: 0, errors: [] };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { warmed: 0, errors: [], skipped: 'offline' };
  }

  let warmed = 0;
  const errors = [];
  const tuneList = tunes ? Object.keys(tunes).map(function(key) { return tunes[key]; }) : [];

  for (let t = 0; t < tuneList.length; t += 1) {
    const tune = tuneList[t];
    if (!tune || !tune.id || !Array.isArray(tune.links)) continue;

    for (let linkIndex = 0; linkIndex < tune.links.length; linkIndex += 1) {
      const link = tune.links[linkIndex];
      if (!isOwnedMediaLink(link)) continue;
      if (!link.googleId) continue;

      const recordingId = link.recordingId || parseRecordingIdFromLinkUri(link.link);
      if (recordingId) {
        // eslint-disable-next-line no-await-in-loop
        const recording = await getRecording(recordingId);
        if (!recording) continue;
      } else {
        continue;
      }

      const linkUri = link.link || buildRecordingLinkUri(link.recordingId);
      const cacheKey = getExternalMediaCacheKey(tune.id, linkIndex, linkUri);
      // eslint-disable-next-line no-await-in-loop
      if (await isExternalMediaCached(cacheKey)) continue;

      try {
        if (isMidiOwnedMediaLink(link)) {
          // eslint-disable-next-line no-await-in-loop
          await resolveRecordingLinkMidi(link, tune.id, linkIndex, {
            accessToken: accessToken,
            driveApi: driveApi,
            forPlayback: true,
          });
        } else {
          // eslint-disable-next-line no-await-in-loop
          await resolveRecordingLinkAudio(link, tune.id, linkIndex, {
            accessToken: accessToken,
            driveApi: driveApi,
            forPlayback: true,
          });
        }
        warmed += 1;
      } catch (err) {
        errors.push((err && err.message) || 'Warm cache failed');
      }
    }
  }

  return { warmed: warmed, errors: errors };
}
