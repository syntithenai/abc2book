import { decodeAudioBytes } from './audioDecodeBytes';
import { fetchDirectOrProxy, isMediaProxyConfigured } from './mediaProxyClient';
import { resolveRecordingLinkAudio, isOwnedMediaLinkUri } from './linkRecording';
import {
  fetchYoutubeAudioViaExtension,
  isYoutubeExtensionConnected,
} from './youtubeExtensionClient';
import {
  fetchYoutubeAudioViaNative,
  isYoutubeNativeConnected,
} from './youtubeNativeClient';
import { isAndroidApp } from './platformUtils';

function formatExtensionFetchFailure(extensionError) {
  const detail = extensionError && extensionError.message
    ? String(extensionError.message).trim()
    : 'unknown error';
  return new Error(
    'TuneBook Helper could not download this video (' + detail + '). '
      + 'Try reloading the page, updating the extension, or using a different YouTube link.'
  );
}

function formatResolverFallbackFailure(extensionError, resolverError) {
  const extensionDetail = extensionError && extensionError.message
    ? String(extensionError.message).trim()
    : '';
  const resolverDetail = resolverError && resolverError.message
    ? String(resolverError.message).trim()
    : '';
  if (extensionDetail && resolverDetail) {
    return new Error(
      'TuneBook Helper failed (' + extensionDetail + ') and the media resolver failed ('
        + resolverDetail + ').'
    );
  }
  if (extensionDetail) {
    return formatExtensionFetchFailure(extensionError);
  }
  return resolverError || new Error('Could not download audio for pitch shift');
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
];

export async function resolveYoutubeAudioUrl(videoId) {
  for (let i = 0; i < PIPED_INSTANCES.length; i++) {
    const base = PIPED_INSTANCES[i];
    try {
      const resp = await fetch(`${base}/streams/${videoId}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const streams = data.audioStreams || [];
      if (streams.length === 0) continue;
      streams.sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
      if (streams[0].url) return streams[0].url;
    } catch (e) {
      // try next instance
    }
  }
  return null;
}

/**
 * Prefer native Android fetch, TuneBook Helper extension, media resolver /youtube,
 * then Piped direct URL (best-effort).
 */
export async function fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken, options) {
  const opts = options || {};
  if (srcType === 'recording' || isOwnedMediaLinkUri(src)) {
    const link = opts.link;
    const tuneId = opts.tuneId;
    const linkIndex = opts.linkIndex;
    if (!link || tuneId === undefined || tuneId === null || linkIndex === undefined || linkIndex === null) {
      throw new Error('Recording playback requires tune link context');
    }
    const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
      accessToken: accessToken,
      driveApi: opts.driveApi,
      forPlayback: true,
    });
    const arrayBuffer = await resolved.blob.arrayBuffer();
    const audioBuffer = await decodeAudioBytes(arrayBuffer);
    return {
      audioBuffer: audioBuffer,
      duration: resolved.duration || audioBuffer.duration,
      sourceUrl: resolved.source || 'recording',
      mime: resolved.blob.type || null,
      arrayBuffer: arrayBuffer,
    };
  }

  if (srcType === 'youtube' && typeof youtubeGetId === 'function') {
    const videoId = youtubeGetId(src);
    let extensionFetchError = null;
    if (videoId && isAndroidApp() && (await isYoutubeNativeConnected())) {
      try {
        const fetched = await fetchYoutubeAudioViaNative(videoId);
        const audioBuffer = await decodeAudioBytes(fetched.arrayBuffer);
        return {
          audioBuffer: audioBuffer,
          duration: audioBuffer.duration,
          sourceUrl: 'native',
          mime: fetched.mime,
          arrayBuffer: fetched.arrayBuffer,
          filePath: fetched.filePath,
        };
      } catch (nativeError) {
        console.log(nativeError);
      }
    }
    if (videoId && (await isYoutubeExtensionConnected())) {
      try {
        const fetched = await fetchYoutubeAudioViaExtension(videoId);
        const audioBuffer = await decodeAudioBytes(fetched.arrayBuffer);
        return {
          audioBuffer: audioBuffer,
          duration: audioBuffer.duration,
          sourceUrl: 'extension',
          mime: fetched.mime,
          arrayBuffer: fetched.arrayBuffer,
        };
      } catch (extensionError) {
        extensionFetchError = extensionError;
        if (!isMediaProxyConfigured()) {
          throw formatExtensionFetchFailure(extensionError);
        }
        console.log(extensionError);
      }
    }

    try {
      const { response, viaProxy } = await fetchDirectOrProxy({
        src: src,
        srcType: srcType,
        youtubeGetId: youtubeGetId,
        accessToken: accessToken,
        resolveDirectUrl: async function(s, type, getId) {
          if (type === 'youtube' && !isMediaProxyConfigured()) {
            const videoId = getId(s);
            if (!videoId) return null;
            return resolveYoutubeAudioUrl(videoId);
          }
          return s;
        },
      });

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await decodeAudioBytes(arrayBuffer);
      const mime = response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('Content-Type')
        : null;
      return {
        audioBuffer: audioBuffer,
        duration: audioBuffer.duration,
        sourceUrl: viaProxy ? 'proxy' : src,
        mime: mime || null,
        arrayBuffer: arrayBuffer,
      };
    } catch (resolverError) {
      if (extensionFetchError) {
        throw formatResolverFallbackFailure(extensionFetchError, resolverError);
      }
      throw resolverError;
    }
  }

  const { response, viaProxy } = await fetchDirectOrProxy({
    src: src,
    srcType: srcType,
    youtubeGetId: youtubeGetId,
    accessToken: accessToken,
    resolveDirectUrl: async function(s, type, getId) {
      if (type === 'youtube' && !isMediaProxyConfigured()) {
        const videoId = getId(s);
        if (!videoId) return null;
        return resolveYoutubeAudioUrl(videoId);
      }
      return s;
    },
  });

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await decodeAudioBytes(arrayBuffer);
  const mime = response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('Content-Type')
    : null;
  return {
    audioBuffer: audioBuffer,
    duration: audioBuffer.duration,
    sourceUrl: viaProxy ? 'proxy' : src,
    mime: mime || null,
    arrayBuffer: arrayBuffer,
  };
}
