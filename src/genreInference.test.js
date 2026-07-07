import {
  buildGenreSearchContext,
  extractGenreFromAbc,
  inferGenreFromSearchContext,
  normalizeInferredGenre,
  shouldOfferGenreSuggestion,
} from './genreInference';

describe('genreInference', function() {
  test('normalizes inferred genre to canonical suggestion spelling', function() {
    expect(normalizeInferredGenre('folk')).toBe('Folk');
    expect(normalizeInferredGenre('Custom Style')).toBe('Custom Style');
  });

  test('reads genre from ABC G: header', function() {
    const abc = 'X:1\nT:Test\nG:Bluegrass\nK:G\n';
    expect(extractGenreFromAbc(abc)).toBe('Bluegrass');
  });

  test('infers Irish Traditional from The Session source', function() {
    const result = inferGenreFromSearchContext({
      source: 'thesession.org',
      sourceUrl: 'https://thesession.org/tunes/123',
    });
    expect(result).toEqual({ genre: 'Irish Traditional', reason: 'The Session' });
  });

  test('infers genre from rhythm when source is unknown', function() {
    const result = inferGenreFromSearchContext({ rhythm: 'strathspey' });
    expect(result).toEqual({ genre: 'Scottish Traditional', reason: 'strathspey tune type' });
  });

  test('infers genre from background research text', function() {
    const result = inferGenreFromSearchContext({
      backgroundText: 'This tune is a classic example of progressive bluegrass.',
    });
    expect(result).toEqual({ genre: 'Progressive Bluegrass', reason: 'background research' });
  });

  test('buildGenreSearchContext merges result and extras', function() {
    expect(buildGenreSearchContext(
      { source: 'example.com', text: 'A folk song' },
      { title: 'Tune', rhythm: 'reel' }
    )).toEqual({
      title: 'Tune',
      artist: '',
      source: 'example.com',
      sourceUrl: '',
      rhythm: 'reel',
      tuneMeta: null,
      abc: '',
      backgroundText: 'A folk song',
      genre: '',
    });
  });

  test('shouldOfferGenreSuggestion respects current genre', function() {
    expect(shouldOfferGenreSuggestion('Folk', '')).toBe(true);
    expect(shouldOfferGenreSuggestion('Folk', 'folk')).toBe(false);
    expect(shouldOfferGenreSuggestion('Jazz', 'Folk')).toBe(true);
  });
});
