jest.mock('music-metadata-browser', function() {
  return {
    parseBlob: jest.fn(),
  };
});

import { parseBlob } from 'music-metadata-browser';
import {
  isAudioImportFile,
  titleArtistFromFilename,
  readAudioFileMetadata,
  audioFileAcceptList,
} from './audioFileMetadata';

describe('audioFileMetadata', function() {
  beforeEach(function() {
    parseBlob.mockReset();
  });

  test('isAudioImportFile detects mime type and extensions', function() {
    expect(isAudioImportFile({ name: 'song.abc', type: 'text/plain' })).toBe(false);
    expect(isAudioImportFile({ name: 'song.mp3', type: 'audio/mpeg' })).toBe(true);
    expect(isAudioImportFile({ name: 'song.flac', type: '' })).toBe(true);
  });

  test('isAudioImportFile rejects midi and images', function() {
    expect(isAudioImportFile({ name: 'song.mid', type: 'audio/midi' })).toBe(false);
    expect(isAudioImportFile({ name: 'song.mid', type: '' })).toBe(false);
    expect(isAudioImportFile({ name: 'scan.png', type: 'image/png' })).toBe(false);
  });

  test('audioFileAcceptList lists audio extensions only', function() {
    const accept = audioFileAcceptList();
    expect(accept).toContain('.mp3');
    expect(accept).toContain('.wav');
    expect(accept).not.toContain('.mid');
    expect(accept).not.toContain('audio/midi');
  });

  test('titleArtistFromFilename splits artist and title', function() {
    expect(titleArtistFromFilename('Artist - Title.mp3')).toEqual({
      artist: 'Artist',
      title: 'Title',
    });
    expect(titleArtistFromFilename('Only Title.wav')).toEqual({
      artist: '',
      title: 'Only Title',
    });
  });

  test('readAudioFileMetadata prefers tags over filename', async function() {
    parseBlob.mockResolvedValue({
      common: {
        title: 'Tagged Title',
        artist: 'Tagged Artist',
        album: 'Tagged Album',
      },
      format: { duration: 123.4 },
    });

    const meta = await readAudioFileMetadata({ name: 'Other - Name.mp3', type: 'audio/mpeg' });
    expect(meta).toEqual({
      title: 'Tagged Title',
      artist: 'Tagged Artist',
      album: 'Tagged Album',
      duration: 123.4,
    });
  });

  test('readAudioFileMetadata uses artists array when artist string missing', async function() {
    parseBlob.mockResolvedValue({
      common: {
        title: 'Tagged Title',
        artists: ['Lead Artist', 'Featured Artist'],
      },
      format: {},
    });

    const meta = await readAudioFileMetadata({ name: 'Other.mp3', type: 'audio/mpeg' });
    expect(meta.title).toBe('Tagged Title');
    expect(meta.artist).toBe('Lead Artist, Featured Artist');
  });

  test('readAudioFileMetadata falls back to filename when tags missing', async function() {
    parseBlob.mockResolvedValue({ common: {}, format: {} });

    const meta = await readAudioFileMetadata({ name: 'Artist - Title.mp3' });
    expect(meta.title).toBe('Title');
    expect(meta.artist).toBe('Artist');
  });

  test('readAudioFileMetadata falls back when parse fails', async function() {
    parseBlob.mockRejectedValue(new Error('bad file'));

    const meta = await readAudioFileMetadata({ name: 'Artist - Title.mp3' });
    expect(meta.title).toBe('Title');
    expect(meta.artist).toBe('Artist');
  });
});
