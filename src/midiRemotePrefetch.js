import { resolveMidiLinkPlaybackData } from './midiLinkResolve';
import { isMidiHeader } from './midiFileUtils';
import { isOwnedMediaLinkUri } from './linkRecording';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function needsClientMidiBytes(payload) {
  if (!payload || payload.midiBase64) return false;
  const sourceType = String(payload.sourceType || '').toLowerCase();
  if (sourceType === 'midifile' || sourceType === 'midi') return true;
  const source = String(payload.source || '').trim();
  return isOwnedMediaLinkUri(source);
}

/**
 * Attach midiBase64 for Cast/Snapcast when the resolver cannot fetch the source URL
 * (owned recordings, Drive-backed MIDI, etc.). Mirrors youtubeRemoteAudioPrefetch.
 */
export async function enrichPayloadWithMidiPrefetch(payload, mediaController) {
  if (!needsClientMidiBytes(payload)) return payload;
  const mc = mediaController;
  if (!mc || !mc.tune) {
    throw new Error('MIDI is only available on this device — resolver cannot fetch the link');
  }
  const tune = mc.tune;
  const linkIndex = mc.mediaLinkNumber != null ? mc.mediaLinkNumber : 0;
  const link = tune.links && tune.links[linkIndex];
  if (!link) {
    throw new Error('No MIDI link on this tune');
  }
  const linkedOpts = mc.getLinkedMediaResolveOptions
    ? mc.getLinkedMediaResolveOptions()
    : {};
  const youtubeGetId = mc.youtubeGetId
    || (mc.tunebook && mc.tunebook.utils ? mc.tunebook.utils.YouTubeGetID : null);
  const data = await resolveMidiLinkPlaybackData(link, tune.id, linkIndex, {
    isYoutubeLink: youtubeGetId,
    accessToken: linkedOpts.accessToken,
    driveApi: linkedOpts.driveApi,
  });
  if (!data || !data.arrayBuffer) {
    throw new Error('Could not load MIDI for remote playback');
  }
  const bytes = new Uint8Array(data.arrayBuffer);
  if (!isMidiHeader(bytes)) {
    throw new Error('Loaded data is not a valid MIDI file');
  }
  return Object.assign({}, payload, {
    midiBase64: arrayBufferToBase64(data.arrayBuffer),
    sourceType: payload.sourceType || 'midifile',
  });
}

export function __arrayBufferToBase64ForTests(buffer) {
  return arrayBufferToBase64(buffer);
}
