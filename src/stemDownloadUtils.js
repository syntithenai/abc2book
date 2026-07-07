import { AUDIO_FILTER_KEYS, STEM_NAME_BY_FILTER } from './pitchTempoUtils';
import {
  loadStemBuffersForSource,
  encodeAudioBufferToWav,
} from './nativeFilteredMedia';
import { downloadBlob, sanitizeDownloadFilename } from './tuneDownloadActions';
import { createZipArchive } from './zipStore';

export const STEM_DOWNLOAD_WAV_NAMES = AUDIO_FILTER_KEYS.map(function(key) {
  return key + '.wav';
});

export function soloStemAudioFilters(filterKey) {
  const filters = {};
  AUDIO_FILTER_KEYS.forEach(function(key) {
    filters[key] = key === filterKey ? 1 : 0;
  });
  return filters;
}

async function createSilentWavBlob(sampleRate, length) {
  const offline = new OfflineAudioContext(2, Math.max(1, length), sampleRate || 44100);
  const silent = await offline.startRendering();
  return encodeAudioBufferToWav(silent);
}

function stemWavBytesToUint8Array(bytes) {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

export async function stemZipEntryDataForFilter(loaded, filterKey) {
  const stemName = STEM_NAME_BY_FILTER[filterKey];
  const rawBytes = loaded.stemWavBytes && loaded.stemWavBytes[stemName];
  const fromCache = stemWavBytesToUint8Array(rawBytes);
  if (fromCache) {
    return fromCache;
  }

  const buffer = loaded.stemBuffers && loaded.stemBuffers[stemName];
  if (buffer) {
    const wavBlob = encodeAudioBufferToWav(buffer);
    return new Uint8Array(await wavBlob.arrayBuffer());
  }

  const silent = await createSilentWavBlob(44100, 1);
  return new Uint8Array(await silent.arrayBuffer());
}

export async function buildStemZipBlob(cacheOptions, options) {
  const opts = options || {};

  function report(percent, message) {
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(percent, message);
    }
  }

  report(0, 'Loading stems...');
  const loaded = await loadStemBuffersForSource(cacheOptions, {
    allowNetworkSeparation: true,
    signal: opts.signal,
    onProgress: function(message, percent) {
      const mapped = 5 + Math.round((percent || 0) * 0.8);
      report(mapped, message || 'Separating stems...');
    },
    onStatus: opts.onStatus,
  });

  if (!loaded.stemBuffers || Object.keys(loaded.stemBuffers).filter(Boolean).length === 0) {
    throw new Error('No stem data available for this linked media.');
  }

  const entries = [];
  for (let i = 0; i < AUDIO_FILTER_KEYS.length; i += 1) {
    const filterKey = AUDIO_FILTER_KEYS[i];
    report(
      85 + Math.round((i / AUDIO_FILTER_KEYS.length) * 10),
      'Packaging ' + filterKey + '...'
    );
    entries.push({
      name: filterKey + '.wav',
      data: await stemZipEntryDataForFilter(loaded, filterKey),
    });
  }

  report(98, 'Creating zip...');
  const zipBlob = createZipArchive(entries);
  report(100, 'Done');
  return zipBlob;
}

export async function downloadStemZipForTune(tune, resolvedLink, options) {
  const cacheOptions = {
    tuneId: tune.id,
    linkIndex: resolvedLink.linkIndex,
    src: resolvedLink.src,
    srcType: resolvedLink.srcType,
    label: resolvedLink.linkTitle || '',
    accessToken: options.accessToken,
    demucsModel: options.demucsModel || '',
  };
  const zipBlob = await buildStemZipBlob(cacheOptions, options);
  const filename = sanitizeDownloadFilename(tune.name, 'tune') + ' stems.zip';
  downloadBlob(filename, zipBlob);
}
