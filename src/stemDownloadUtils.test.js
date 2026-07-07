import { soloStemAudioFilters, STEM_DOWNLOAD_WAV_NAMES, stemZipEntryDataForFilter } from './stemDownloadUtils';
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

  test('soloStemAudioFilters mutes every other stem', function() {
    AUDIO_FILTER_KEYS.forEach(function(filterKey) {
      const filters = soloStemAudioFilters(filterKey);
      AUDIO_FILTER_KEYS.forEach(function(key) {
        expect(filters[key]).toBe(key === filterKey ? 1 : 0);
      });
    });
  });

  test('stemZipEntryDataForFilter prefers cached wav bytes', async function() {
    const bytes = new Uint8Array([82, 73, 70, 70]);
    const data = await stemZipEntryDataForFilter({
      stemWavBytes: { vocals: bytes.buffer },
      stemBuffers: {},
    }, 'vocals');
    expect(data).toEqual(bytes);
  });
});
