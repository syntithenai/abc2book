import { openMidiImportWizard } from './midiImportWizard';
import { fetchViaMediaProxy } from './mediaProxyClient';

function base64ToUint8Array(encoded) {
  const binary = atob(String(encoded || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isDeferredMidiNotationCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.importFormat === 'midi') return true;
  const meta = candidate.tuneMeta && candidate.tuneMeta.meta;
  return !!(meta && meta.importFormat === 'midi') || !!candidate.midiBytes;
}

function looksLikeMidiBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data.length < 4) return false;
  return data[0] === 0x4d && data[1] === 0x54 && data[2] === 0x68 && data[3] === 0x64;
}

function midiResourceProxyPath(sourceUrl) {
  const raw = String(sourceUrl || '');
  const marker = '/midi-resources/';
  const idx = raw.indexOf(marker);
  if (idx < 0) return '';
  const rest = raw.slice(idx + marker.length).split('?')[0];
  const segments = rest.split('/').filter(Boolean).map(function(segment) {
    try {
      return encodeURIComponent(decodeURIComponent(segment));
    } catch (e) {
      return encodeURIComponent(segment);
    }
  });
  return marker + segments.join('/');
}

export async function applyNotationSearchCandidate(candidate, options) {
  const opts = options || {};
  if (isDeferredMidiNotationCandidate(candidate)) {
    const wizardResult = await importDeferredMidiCandidate(candidate, opts);
    const imported = wizardResult.candidates && wizardResult.candidates[0];
    const abc = (wizardResult.result && wizardResult.result.abc)
      || (imported && imported.tune && opts.tunebook && opts.tunebook.abcTools
        ? opts.tunebook.abcTools.json2abc(imported.tune)
        : '');
    if (opts.onAbc && abc) {
      opts.onAbc(abc, opts.sourceLabel ? opts.sourceLabel(candidate) : '', imported || candidate);
    }
    return wizardResult;
  }
  if (candidate && candidate.abc && opts.onAbc) {
    opts.onAbc(candidate.abc, opts.sourceLabel ? opts.sourceLabel(candidate) : '', candidate);
  }
  return null;
}

export async function importDeferredMidiCandidate(candidate, options) {
  const opts = options || {};
  let bytes = null;
  if (candidate.midiBytes) {
    bytes = base64ToUint8Array(candidate.midiBytes);
  } else if (candidate.sourceUrl) {
    const sourceUrl = String(candidate.sourceUrl);
    const localPath = midiResourceProxyPath(sourceUrl);
    const response = localPath
      ? await fetchViaMediaProxy(localPath, opts.accessToken)
      : await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error('Could not download MIDI file');
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (!bytes || !bytes.byteLength) {
    throw new Error('MIDI candidate has no downloadable data');
  }
  if (!looksLikeMidiBytes(bytes)) {
    throw new Error('Downloaded file is not a MIDI file');
  }
  const fileName = (candidate.title || 'import') + '.mid';
  return openMidiImportWizard({
    midiBytes: bytes,
    fileName: fileName,
    sourceUrl: candidate.sourceUrl || '',
    accessToken: opts.accessToken,
  });
}
