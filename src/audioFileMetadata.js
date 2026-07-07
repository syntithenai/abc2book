import { parseBlob } from 'music-metadata-browser';

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.wma', '.opus', '.webm'];
const MIDI_EXTENSIONS = ['.mid', '.midi'];
const MIDI_MIME_TYPES = ['audio/midi', 'audio/mid', 'audio/x-midi'];

const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/mp4',
  'audio/ogg',
  'audio/aac',
  'audio/webm',
  'audio/x-ms-wma',
  'audio/opus',
];

export function audioFileAcceptList() {
  return AUDIO_EXTENSIONS.concat(AUDIO_MIME_TYPES).join(',');
}

export function isAudioImportFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (MIDI_EXTENSIONS.some(function(ext) { return name.endsWith(ext); })) return false;
  if (MIDI_MIME_TYPES.includes(type)) return false;
  if (type.startsWith('image/')) return false;
  if (AUDIO_MIME_TYPES.includes(type)) return true;
  if (type.startsWith('audio/') && !MIDI_MIME_TYPES.includes(type)) return true;
  return AUDIO_EXTENSIONS.some(function(ext) {
    return name.endsWith(ext);
  });
}

export function titleArtistFromFilename(fileName) {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim();
  if (!base) {
    return { title: '', artist: '' };
  }
  const parts = base.split(/\s*[-–—|]\s+/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    };
  }
  return { title: base, artist: '' };
}

function firstNonEmpty(values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function tagText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map(function(item) {
      if (item == null) return '';
      if (typeof item === 'object' && item.name) return String(item.name).trim();
      return String(item).trim();
    }).filter(Boolean).join(', ');
  }
  return String(value).trim();
}

function artistFromCommon(common) {
  if (!common || typeof common !== 'object') return '';
  return firstNonEmpty([
    tagText(common.artist),
    tagText(common.artists),
    tagText(common.albumartist),
    tagText(common.albumartists),
    tagText(common.composers),
  ]);
}

function titleFromCommon(common) {
  if (!common || typeof common !== 'object') return '';
  const track = common.track && typeof common.track === 'object' ? common.track : null;
  return firstNonEmpty([
    tagText(common.title),
    track ? tagText(track.title) : '',
  ]);
}

function mimeTypeFromFilename(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.flac')) return 'audio/flac';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.aac')) return 'audio/aac';
  if (name.endsWith('.wma')) return 'audio/x-ms-wma';
  if (name.endsWith('.opus')) return 'audio/opus';
  if (name.endsWith('.webm')) return 'audio/webm';
  return '';
}

export async function readAudioFileMetadata(file) {
  if (!file) {
    throw new Error('No audio file provided');
  }

  let title = '';
  let artist = '';
  let album = '';
  let duration = null;

  try {
    const mimeType = file.type || mimeTypeFromFilename(file.name);
    const parseOptions = mimeType ? { mimeType: mimeType } : undefined;
    const metadata = await parseBlob(file, parseOptions);
    const common = metadata && metadata.common ? metadata.common : {};
    title = titleFromCommon(common);
    artist = artistFromCommon(common);
    album = firstNonEmpty([tagText(common.album)]);
    if (metadata && metadata.format && typeof metadata.format.duration === 'number') {
      duration = metadata.format.duration;
    }
  } catch (e) {
    // Fall back to filename when tag parsing fails.
  }

  const fromName = titleArtistFromFilename(file.name);
  if (!title) title = fromName.title;
  if (!artist) artist = fromName.artist;

  return {
    title: title,
    artist: artist,
    album: album,
    duration: duration,
  };
}
