import {
  normalizeTuneBackgroundResearch,
  handleTuneBackgroundResearchStreamEvent,
  formatResearchDuration,
  buildTuneBackgroundResearchQueries,
  buildTuneBackgroundSearchQuery,
  buildTuneBackgroundSearchUrl,
  extractFirstLyricLine,
  lyricsSearchPhrases,
} from './tuneBackgroundResearchClient';

describe('tuneBackgroundResearchClient', function() {
  test('normalizeTuneBackgroundResearch maps response', function() {
    const result = normalizeTuneBackgroundResearch({
      text: 'A well-known folk tune first recorded in 1930.',
      sources: [{ title: 'Example', url: 'https://example.com', snippet: 'snippet' }],
      searchBackend: 'duckduckgo',
      model: 'google/gemma-3-4b-it',
      title: 'Wild Rover',
      artist: 'The Dubliners',
      timing: { searchMs: 1200, summarizeMs: 45000, totalMs: 46200, wordCount: 812 },
    });

    expect(result.text).toBe('A well-known folk tune first recorded in 1930.');
    expect(result.sources).toHaveLength(1);
    expect(result.searchBackend).toBe('duckduckgo');
    expect(result.model).toBe('google/gemma-3-4b-it');
    expect(result.timing.wordCount).toBe(812);
    expect(result.timing.totalMs).toBe(46200);
  });

  test('formatResearchDuration formats seconds and minutes', function() {
    expect(formatResearchDuration(850)).toBe('850ms');
    expect(formatResearchDuration(45000)).toBe('45s');
    expect(formatResearchDuration(125000)).toBe('2m 5s');
  });

  test('normalizeTuneBackgroundResearch rejects empty text', function() {
    expect(function() {
      normalizeTuneBackgroundResearch({ text: '   ' });
    }).toThrow('Tune background research returned no text');
  });

  test('handleTuneBackgroundResearchStreamEvent returns result events', function() {
    const messages = [];
    const result = handleTuneBackgroundResearchStreamEvent({
      type: 'result',
      body: {
        text: 'Summary text',
        sources: [],
      },
    }, function(message) {
      messages.push(message);
    });

    expect(result.text).toBe('Summary text');
    expect(messages).toHaveLength(0);
  });

  test('handleTuneBackgroundResearchStreamEvent forwards progress', function() {
    const events = [];
    handleTuneBackgroundResearchStreamEvent({
      type: 'progress',
      message: 'Searching...',
      progress: 0.2,
      stage: 'search',
      elapsedMs: 1500,
    }, function(message, progress, stage, elapsedMs) {
      events.push({ message: message, progress: progress, stage: stage, elapsedMs: elapsedMs });
    });

    expect(events).toEqual([{
      message: 'Searching...',
      progress: 0.2,
      stage: 'search',
      elapsedMs: 1500,
    }]);
  });

  test('extractFirstLyricLine skips section headers', function() {
    expect(extractFirstLyricLine('[Verse 1]\nGet you a copper kettle\nFill it full of corn')).toBe('Get you a copper kettle');
  });

  test('lyricsSearchPhrases skips section headers', function() {
    expect(lyricsSearchPhrases('[Verse 1]\nGet you a copper kettle\nFill it full of corn')).toEqual([
      'Get you a copper kettle',
      'Fill it full of corn',
    ]);
  });

  test('buildTuneBackgroundResearchQueries mirrors resolver search queries', function() {
    const queries = buildTuneBackgroundResearchQueries(
      'Wild Rover',
      'Dubliners',
      'Get you a copper kettle\nFill it full of corn'
    );
    expect(queries.length).toBeGreaterThanOrEqual(11);
    expect(queries.some(function(query) { return query.indexOf('"Wild Rover" "Dubliners" song history origin') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('site:youtube.com "Wild Rover" Dubliners') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('"Get you a copper kettle" song lyrics') >= 0; })).toBe(true);
  });

  test('buildTuneBackgroundSearchQuery includes resolver research topics and lyric line', function() {
    const query = buildTuneBackgroundSearchQuery(
      'Copper Kettle',
      'Traditional',
      'Get you a copper kettle\nFill it full of corn'
    );
    expect(query).toContain('"Copper Kettle"');
    expect(query).not.toContain('Traditional');
    expect(query).toContain('"Get you a copper kettle"');
    expect(query).toContain('first recorded written');
    expect(query).toContain('notable recordings performers covers');
    expect(query).toContain('site:youtube.com');
  });

  test('buildTuneBackgroundSearchUrl stays within browser URL limits', function() {
    const longLyrics = 'Get you a copper kettle and a copper coil\n'.repeat(40);
    const url = buildTuneBackgroundSearchUrl('Copper Kettle', 'Joan Baez', longLyrics);
    expect(url.indexOf('https://www.google.com/search?q=')).toBe(0);
    expect(url.length).toBeLessThanOrEqual(2048);
  });
});
