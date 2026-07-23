import { AUDIO_FILTER_KEYS, STEM_NAME_BY_FILTER } from './pitchTempoUtils';
import {
  loadStemBuffersForSource,
} from './nativeFilteredMedia';
import { downloadBlob, sanitizeDownloadFilename } from './tuneDownloadActions';
import { createZipArchive } from './zipStore';
import { encodeAudioBuffer, blobToArrayBuffer } from './audioCompressEncode';
import {
  getAudioCompressExtension,
  getAudioCompressFormat,
} from './audioCompressSettings';
import { areStemBulkOperationsEnabled } from './stemBulkOperations';

export function stemDownloadEntryNames(extension) {
  const ext = extension || getAudioCompressExtension(getAudioCompressFormat());
  return AUDIO_FILTER_KEYS.map(function(key) {
    return key + '.' + ext;
  });
}

/** @deprecated use stemDownloadEntryNames */
export const STEM_DOWNLOAD_WAV_NAMES = stemDownloadEntryNames('wav');

export function soloStemAudioFilters(filterKey) {
  const filters = {};
  AUDIO_FILTER_KEYS.forEach(function(key) {
    filters[key] = key === filterKey ? 1 : 0;
  });
  return filters;
}

function stemBytesToUint8Array(bytes) {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

export async function stemZipEntryDataForFilter(loaded, filterKey, options) {
  const opts = options || {};
  const format = opts.format || loaded.audioFormat || getAudioCompressFormat();
  const stemName = STEM_NAME_BY_FILTER[filterKey];
  const rawBytes = (loaded.stemAudioBytes && loaded.stemAudioBytes[stemName])
    || (loaded.stemWavBytes && loaded.stemWavBytes[stemName]);
  const fromCache = stemBytesToUint8Array(rawBytes);
  if (fromCache && (!opts.forceReencode)) {
    return {
      data: fromCache,
      extension: getAudioCompressExtension(format),
      format: format,
    };
  }

  const buffer = loaded.stemBuffers && loaded.stemBuffers[stemName];
  if (buffer) {
    const encoded = await encodeAudioBuffer(buffer, format);
    const arrayBuffer = await blobToArrayBuffer(encoded.blob);
    return {
      data: new Uint8Array(arrayBuffer),
      extension: encoded.extension,
      format: encoded.format,
    };
  }

  // Silent placeholder in the requested format
  const offline = new OfflineAudioContext(2, 1, 44100);
  const silent = await offline.startRendering();
  const encoded = await encodeAudioBuffer(silent, format);
  const arrayBuffer = await blobToArrayBuffer(encoded.blob);
  return {
    data: new Uint8Array(arrayBuffer),
    extension: encoded.extension,
    format: encoded.format,
  };
}

export async function buildStemZipBlob(cacheOptions, options) {
  const opts = options || {};
  const format = opts.audioFormat || getAudioCompressFormat();

  function report(percent, message) {
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(percent, message);
    }
  }

  report(0, 'Loading stems...');
  const loaded = await loadStemBuffersForSource(cacheOptions, {
    allowNetworkSeparation: areStemBulkOperationsEnabled(),
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
    const entry = await stemZipEntryDataForFilter(loaded, filterKey, {
      format: loaded.audioFormat || format,
    });
    entries.push({
      name: filterKey + '.' + entry.extension,
      data: entry.data,
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
