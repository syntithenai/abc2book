import { fetchViaMediaProxy } from './mediaProxyClient';
import { extractMusicXmlFromMxl, isMusicXmlText, isMuseScoreNativeText } from './mxlExtract';
import { musicXmlToAbc, MIDI_XML2ABC_OPTIONS } from './musicXmlToAbc';
import { importMidiToAbc } from './midiToAbcClient';

export const MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_ABC_IMPORT_BYTES = 512 * 1024;

const SCORE_EXTENSIONS = {
  abc: 'abc',
  txt: 'abc',
  xml: 'musicxml',
  musicxml: 'musicxml',
  mxl: 'mxl',
  mid: 'midi',
  midi: 'midi',
  mscx: 'mscx',
};

function extensionOf(fileName) {
  if (!fileName || fileName.indexOf('.') === -1) {
    return '';
  }
  return fileName.split('.').pop().toLowerCase();
}

export function detectScoreFormat(fileName) {
  const ext = extensionOf(fileName);
  return SCORE_EXTENSIONS[ext] || null;
}

function readFileAsArrayBuffer(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function() { resolve(reader.result); };
    reader.onerror = function() { reject(new Error('Could not read file')); };
    reader.readAsArrayBuffer(file);
  });
}

function decodeArrayBufferToText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    try {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    } catch (e) {
      const swapped = new Uint8Array(bytes.length - 2);
      for (let i = 2, j = 0; i + 1 < bytes.length; i += 2, j += 2) {
        swapped[j] = bytes[i + 1];
        swapped[j + 1] = bytes[i];
      }
      return new TextDecoder('utf-16le').decode(swapped);
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function normalizeMidiBytes(midiBytes) {
  if (!midiBytes) return null;
  if (midiBytes instanceof ArrayBuffer) {
    return new Uint8Array(midiBytes);
  }
  if (ArrayBuffer.isView(midiBytes)) {
    return midiBytes;
  }
  if (Array.isArray(midiBytes)) {
    if (midiBytes.length === 1) {
      return normalizeMidiBytes(midiBytes[0]);
    }
    if (midiBytes.every(function(part) { return part instanceof Uint8Array; })) {
      const total = midiBytes.reduce(function(sum, part) { return sum + part.length; }, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      midiBytes.forEach(function(part) {
        merged.set(part, offset);
        offset += part.length;
      });
      return merged;
    }
  }
  return midiBytes;
}

async function readMusicXmlConversionResponse(response, errorLabel) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.indexOf('application/json') !== -1) {
    const body = await response.json();
    throw new Error(body.error || errorLabel);
  }

  const musicXml = await response.text();
  if (!musicXml.trim()) {
    throw new Error(errorLabel + ' returned empty MusicXML');
  }
  return musicXml;
}

export async function abcToMusicXml(abcText, fileName, accessToken, signal) {
  const text = abcText === null || abcText === undefined ? '' : String(abcText).trim();
  if (!text) {
    throw new Error('ABC notation is empty');
  }

  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_ABC_IMPORT_BYTES) {
    throw new Error(
      'ABC notation is too large (' + bytes.byteLength + ' bytes; limit is '
      + MAX_ABC_IMPORT_BYTES + ')'
    );
  }

  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: 'text/plain' }), fileName || 'export.abc');

  const response = await fetchViaMediaProxy('/abc2xml', accessToken, {
    method: 'POST',
    body: formData,
    signal: signal,
    headers: {
      Accept: 'application/xml, text/xml, text/plain, application/json',
    },
  });

  return readMusicXmlConversionResponse(response, 'ABC conversion');
}

export async function midiToMusicXml(midiBytes, fileName, accessToken, signal) {
  const normalized = normalizeMidiBytes(midiBytes);
  if (!normalized || !normalized.byteLength) {
    throw new Error('MIDI file is empty');
  }
  if (normalized.byteLength > MAX_MIDI_IMPORT_BYTES) {
    throw new Error(
      'MIDI file is too large (' + normalized.byteLength + ' bytes; limit is '
      + MAX_MIDI_IMPORT_BYTES + ')'
    );
  }

  const formData = new FormData();
  formData.append('file', new Blob([normalized], { type: 'audio/midi' }), fileName || 'import.mid');

  const response = await fetchViaMediaProxy('/midi2xml', accessToken, {
    method: 'POST',
    body: formData,
    signal: signal,
    headers: {
      Accept: 'application/xml, text/xml, text/plain, application/json',
    },
  });

  return readMusicXmlConversionResponse(response, 'MIDI conversion');
}

export async function convertMuseScoreFileToMusicXml(file, accessToken, signal) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'score.mscx');

  const response = await fetchViaMediaProxy('/score2xml', accessToken, {
    method: 'POST',
    body: formData,
    signal: signal,
    headers: {
      Accept: 'application/xml, text/xml, text/plain, application/json',
    },
  });

  return readMusicXmlConversionResponse(response, 'MuseScore conversion');
}

async function resolveMusicXmlFromFile(file, format, accessToken, signal, onProgress) {
  const buffer = await readFileAsArrayBuffer(file);
  const text = decodeArrayBufferToText(buffer);

  if (format === 'mscx') {
    if (isMusicXmlText(text)) {
      return text;
    }
    if (isMuseScoreNativeText(text)) {
      if (!accessToken) {
        throw new Error('Native MuseScore .mscx import needs the media resolver.');
      }
      if (typeof onProgress === 'function') {
        onProgress('Converting MuseScore file to MusicXML...');
      }
      return convertMuseScoreFileToMusicXml(file, accessToken, signal);
    }
    throw new Error('File does not look like a MuseScore or MusicXML score');
  }

  if (!isMusicXmlText(text)) {
    throw new Error('File does not look like MusicXML');
  }
  return text;
}

/**
 * Import a score file and return ABC text.
 */
export async function importScoreFile(options) {
  const {
    file,
    accessToken,
    signal,
    xml2abcOptions,
    onProgress,
  } = options;

  if (!file) {
    throw new Error('No file selected');
  }

  const format = detectScoreFormat(file.name);
  if (!format) {
    throw new Error('Unsupported score format: ' + (file.name || 'unknown'));
  }

  const conversionOptions = Object.assign({}, xml2abcOptions || {}, { fileName: file.name });
  const warnings = [];

  if (format === 'abc') {
    const buffer = await readFileAsArrayBuffer(file);
    const abc = decodeArrayBufferToText(buffer).trim();
    if (!abc) {
      throw new Error('ABC file is empty');
    }
    return { abc: abc, sourceFormat: 'abc', warnings: warnings };
  }

  if (format === 'mxl') {
    if (typeof onProgress === 'function') {
      onProgress('Extracting MusicXML from MXL...');
    }
    const buffer = await readFileAsArrayBuffer(file);
    const musicXml = await extractMusicXmlFromMxl(buffer);
    if (typeof onProgress === 'function') {
      onProgress('Converting MusicXML to ABC...');
    }
    const abc = musicXmlToAbc(musicXml, conversionOptions);
    return { abc: abc, sourceFormat: 'mxl', warnings: warnings };
  }

  if (format === 'musicxml' || format === 'mscx') {
    const musicXml = await resolveMusicXmlFromFile(
      file,
      format,
      accessToken,
      signal,
      onProgress
    );
    if (typeof onProgress === 'function') {
      onProgress('Converting MusicXML to ABC...');
    }
    const abc = musicXmlToAbc(musicXml, conversionOptions);
    return { abc: abc, sourceFormat: format, warnings: warnings };
  }

  if (format === 'midi') {
    if (typeof onProgress === 'function') {
      onProgress('Analyzing and converting MIDI...');
    }
    const buffer = await readFileAsArrayBuffer(file);
    const midiOpts = {
      signal: signal,
      mode: options.midiMode || null,
      strategy: options.midiStrategy || 'auto',
      includeChords: options.includeChords,
      xml2abcOptions: Object.assign({}, MIDI_XML2ABC_OPTIONS, xml2abcOptions || {}, { fileName: file.name }),
    };
    const result = await importMidiToAbc(buffer, file.name, accessToken, midiOpts);
    if (!result.abc || !result.abc.trim()) {
      throw new Error('MIDI conversion produced no notation');
    }
    warnings.push.apply(warnings, result.warnings || []);
    if (result.confidence < 0.35) {
      warnings.push('Low confidence import — review notation carefully');
    }
    if (result.chords && Array.isArray(result.chords.warnings)) {
      warnings.push.apply(warnings, result.chords.warnings);
    }
    return {
      abc: result.abc,
      sourceFormat: 'midi',
      warnings: warnings,
      chordSegments: result.chordSegments,
      harmonyAbc: result.harmonyAbc,
      harmonyVoiceName: result.harmonyVoiceName,
      chords: result.chords,
      midiImport: {
        strategy: result.strategy,
        mode: result.mode,
        confidence: result.confidence,
        diagnostics: result.diagnostics,
        profile: result.profile,
        chords: result.chords,
        chordSegments: result.chordSegments,
        harmonyAbc: result.harmonyAbc,
        harmonyVoiceName: result.harmonyVoiceName,
      },
    };
  }

  throw new Error('Unsupported score format');
}

/**
 * Convert pasted MusicXML text to ABC.
 */
export function importMusicXmlText(musicXmlText, fileName, xml2abcOptions) {
  const conversionOptions = Object.assign({}, xml2abcOptions || {}, { fileName: fileName || 'import.xml' });
  const abc = musicXmlToAbc(musicXmlText, conversionOptions);
  return { abc: abc, sourceFormat: 'musicxml', warnings: [] };
}
