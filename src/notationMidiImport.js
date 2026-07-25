import { openMidiImportWizard } from './midiImportWizard';

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
    const response = await fetch(candidate.sourceUrl);
    if (!response.ok) {
      throw new Error('Could not download MIDI file');
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (!bytes || !bytes.byteLength) {
    throw new Error('MIDI candidate has no downloadable data');
  }
  const fileName = (candidate.title || 'import') + '.mid';
  return openMidiImportWizard({
    midiBytes: bytes,
    fileName: fileName,
    sourceUrl: candidate.sourceUrl || '',
    accessToken: opts.accessToken,
  });
}
