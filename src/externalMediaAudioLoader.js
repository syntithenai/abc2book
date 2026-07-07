import decode from 'audio-decode';
import { fetchDirectOrProxy, isMediaProxyConfigured } from './mediaProxyClient';

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

export async function fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken) {
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
  const audioBuffer = await decode(arrayBuffer);
  return {
    audioBuffer: audioBuffer,
    duration: audioBuffer.duration,
    sourceUrl: viaProxy ? 'proxy' : src,
  };
}
