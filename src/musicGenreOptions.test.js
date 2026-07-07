import {
  getMusicGenreList,
  getMusicGenreSelectOptions,
  genreSelectValue,
} from './musicGenreOptions';

describe('musicGenreOptions', function() {
  test('provides a sorted unique genre suggestion list', function() {
    const genres = getMusicGenreList();
    expect(genres.length).toBeGreaterThan(50);
    expect(genres).toContain('Folk');
    expect(genres).toContain('Bluegrass');
    expect(genres).toContain('Irish Traditional');
    expect(new Set(genres).size).toBe(genres.length);
    expect(genres.slice().sort(function(a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    })).toEqual(genres);
  });

  test('maps genres to react-select options', function() {
    const options = getMusicGenreSelectOptions();
    expect(options[0]).toEqual({ value: expect.any(String), label: expect.any(String) });
    expect(options.some(function(option) { return option.value === 'Jazz'; })).toBe(true);
  });

  test('genreSelectValue handles empty and custom values', function() {
    expect(genreSelectValue('')).toBeNull();
    expect(genreSelectValue('Custom Genre')).toEqual({
      value: 'Custom Genre',
      label: 'Custom Genre',
    });
  });
});
