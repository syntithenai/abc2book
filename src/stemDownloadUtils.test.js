import {
  soloStemAudioFilters,
  STEM_DOWNLOAD_WAV_NAMES,
  stemDownloadEntryNames,
  stemZipEntryDataForFilter,
} from './stemDownloadUtils';
import { AUDIO_FILTER_KEYS } from './pitchTempoUtils';

describe('stemDownloadUtils', function() {
  test('exports all six stem wav filenames', function() {
    expect(STEM_DOWNLOAD_WAV_NAMES).toEqual([
      'percussion.wav',
      'vocals.wav',
      'bass.wav',
      'guitar.wav',
      'piano.wav',
      'other.wav',
    ]);
  });

  test('stemDownloadEntryNames uses extension', function() {
    expect(stemDownloadEntryNames('m4a')[1]).toBe('vocals.m4a');
    expect(stemDownloadEntryNames('mp3')[0]).toBe('percussion.mp3');
  });

  test('soloStemAudioFilters mutes every other stem', function() {
    AUDIO_FILTER_KEYS.forEach(function(filterKey) {
      const filters = soloStemAudioFilters(filterKey);
      AUDIO_FILTER_KEYS.forEach(function(key) {
        expect(filters[key]).toBe(key === filterKey ? 1 : 0);
      });
    });
  });

  test('stemZipEntryDataForFilter prefers cached bytes', async function() {
    const bytes = new Uint8Array([82, 73, 70, 70]);
    const entry = await stemZipEntryDataForFilter({
      stemWavBytes: { vocals: bytes.buffer },
      stemBuffers: {},
      audioFormat: 'wav',
    }, 'vocals');
    expect(entry.data).toEqual(bytes);
    expect(entry.extension).toBe('wav');
    expect(entry.format).toBe('wav');
  });
});
