import { resolveRecordingLinkAudio } from './linkRecording';
import { getExternalMediaMp3Blob } from './externalMediaAudioCache';
import { trimAudioBuffer, getLinkTrimBounds } from './mediaAudioTrim';
import { encodeAudioBuffer } from './audioCompressEncode';

async function decodeAudioBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const { decodeAudioBytes } = await import('./audioDecodeBytes');
  return decodeAudioBytes(arrayBuffer);
}

async function trimLocalBlobSource(source, tune, options, bounds) {
  let blob = source && source.blob ? source.blob : null;
  let fileName = source && source.fileName
    ? source.fileName
    : ((source && source.label) || 'audio') + '.mp3';
  let label = source && source.label;

  if (!blob && source && source.srcType === 'recording') {
    if (!tune || !Array.isArray(tune.links)) {
      throw new Error('Recording source requires a tune with links');
    }
    const linkIndex = source.linkIndex;
    const link = tune.links[linkIndex];
    if (!link) {
      throw new Error('Recording link is not available for analysis');
    }
    const resolved = await resolveRecordingLinkAudio(link, tune.id, linkIndex, {
      accessToken: options && options.accessToken,
      driveApi: options && options.driveApi,
      forPlayback: false,
    });
    blob = resolved.blob;
    fileName = (link.title || 'recording') + '.mp3';
    label = source.label;
  }

  if (!blob) {
    const linkIndex = source && source.linkIndex;
    if (linkIndex == null || !tune || !tune.id || !source.src) {
      throw new Error('Could not load audio to trim for analysis');
    }
    const cached = await getExternalMediaMp3Blob({
      tuneId: tune.id,
      linkIndex: linkIndex,
      src: source.src,
      srcType: source.srcType,
      youtubeGetId: options && options.youtubeGetId,
      accessToken: options && options.accessToken,
    });
    if (!cached || !cached.blob) {
      throw new Error('Could not load audio for analysis trim');
    }
    blob = cached.blob;
    fileName = (source.label || 'audio') + '.mp3';
    label = source.label;
  }

  const buffer = await decodeAudioBlob(blob);
  const trimmed = trimAudioBuffer(buffer, bounds.startSec, bounds.endSec);
  if (!trimmed) {
    throw new Error('Could not trim audio for analysis');
  }
  const encoded = await encodeAudioBuffer(trimmed, 'wav');
  return {
    id: source.id,
    kind: 'recording',
    blob: encoded.blob,
    fileName: String(fileName || 'audio').replace(/\.[^.]+$/, '') + '.wav',
    label: label || source.label,
    linkIndex: source.linkIndex,
  };
}

/**
 * Resolve recording blobs. When the link has a play range:
 * - local/recording audio is trimmed in the browser
 * - remote YouTube/audio URLs keep the URL and attach startAt/endAt so the
 *   resolver can fetch via yt-dlp and trim server-side (avoids Innertube 403)
 */
export async function prepareMediaAnalysisSource(source, tune, options) {
  if (!source) return source;

  const link = (tune && Array.isArray(tune.links) && source.linkIndex != null)
    ? tune.links[source.linkIndex]
    : null;
  const bounds = link ? getLinkTrimBounds(link) : { startSec: 0, endSec: 0 };
  const needsTrim = bounds.startSec > 0 || bounds.endSec > 0;

  if (!needsTrim) {
    if (source.srcType !== 'recording') {
      return source;
    }
    if (!tune || !Array.isArray(tune.links)) {
      throw new Error('Recording source requires a tune with links');
    }
    const linkIndex = source.linkIndex;
    const recordingLink = tune.links[linkIndex];
    if (!recordingLink) {
      throw new Error('Recording link is not available for analysis');
    }
    const resolved = await resolveRecordingLinkAudio(recordingLink, tune.id, linkIndex, {
      accessToken: options && options.accessToken,
      driveApi: options && options.driveApi,
      forPlayback: false,
    });
    return {
      id: source.id,
      kind: 'recording',
      blob: resolved.blob,
      fileName: (recordingLink.title || 'recording') + '.mp3',
      label: source.label,
      linkIndex: source.linkIndex,
    };
  }

  // Remote URL sources: let the resolver fetch + trim (yt-dlp), not the browser extension.
  if (source.src && source.srcType !== 'recording' && !source.blob) {
    const next = Object.assign({}, source);
    if (bounds.startSec > 0) next.startAt = bounds.startSec;
    if (bounds.endSec > 0) next.endAt = bounds.endSec;
    return next;
  }

  return trimLocalBlobSource(source, tune, options, bounds);
}
