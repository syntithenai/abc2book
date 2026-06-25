import { fetchViaMediaProxy } from './mediaProxyClient';
import { extractMusicXmlFromMxl, isMusicXmlText } from './mxlExtract';
import { musicXmlToAbc } from './musicXmlToAbc';

export const MAX_MIDI_IMPORT_BYTES = 4 * 1024 * 1024;

const SCORE_EXTENSIONS = {
  abc: 'abc',
  txt: 'abc',
  xml: 'musicxml',
  musicxml: 'musicxml',
  mxl: 'mxl',
  mid: 'midi',
  midi: 'midi',
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

async function midiToMusicXml(midiBytes, fileName, accessToken, signal) {
  if (!midiBytes || midiBytes.byteLength === 0) {
    throw new Error('MIDI file is empty');
  }
  if (midiBytes.byteLength > MAX_MIDI_IMPORT_BYTES) {
    throw new Error(
      'MIDI file is too large (' + midiBytes.byteLength + ' bytes; limit is '
      + MAX_MIDI_IMPORT_BYTES + ')'
    );
  }

  const formData = new FormData();
  formData.append('file', new Blob([midiBytes], { type: 'audio/midi' }), fileName || 'import.mid');

  const response = await fetchViaMediaProxy('/midi2xml', accessToken, {
    method: 'POST',
    body: formData,
    signal: signal,
    headers: {
      Accept: 'application/xml, text/xml, text/plain, application/json',
    },
  });

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.indexOf('application/json') !== -1) {
    const body = await response.json();
    throw new Error(body.error || 'MIDI conversion failed');
  }

  const musicXml = await response.text();
  if (!musicXml.trim()) {
    throw new Error('MIDI conversion returned empty MusicXML');
  }
  return musicXml;
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

  if (format === 'musicxml') {
    const buffer = await readFileAsArrayBuffer(file);
    const musicXml = decodeArrayBufferToText(buffer);
    if (!isMusicXmlText(musicXml)) {
      throw new Error('File does not look like MusicXML');
    }
    if (typeof onProgress === 'function') {
      onProgress('Converting MusicXML to ABC...');
    }
    const abc = musicXmlToAbc(musicXml, conversionOptions);
    return { abc: abc, sourceFormat: 'musicxml', warnings: warnings };
  }

  if (format === 'midi') {
    if (typeof onProgress === 'function') {
      onProgress('Converting MIDI to MusicXML...');
    }
    const buffer = await readFileAsArrayBuffer(file);
    const musicXml = await midiToMusicXml(buffer, file.name, accessToken, signal);
    warnings.push('MIDI import is experimental; note durations are quantized.');
    if (typeof onProgress === 'function') {
      onProgress('Converting MusicXML to ABC...');
    }
    const abc = musicXmlToAbc(musicXml, conversionOptions);
    return { abc: abc, sourceFormat: 'midi', warnings: warnings };
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
