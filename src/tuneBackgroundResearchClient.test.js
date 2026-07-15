import {
  normalizeTuneBackgroundResearch,
  handleTuneBackgroundResearchStreamEvent,
  formatResearchDuration,
  buildTuneBackgroundResearchQueries,
  buildTuneBackgroundSearchQuery,
  buildTuneBackgroundSearchUrl,
  extractFirstLyricLine,
  lyricsSearchPhrases,
  researchTuneBackground,
} from './tuneBackgroundResearchClient';
import { fetchViaMediaProxy } from './mediaProxyClient';

jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
  };
});

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

  test('researchTuneBackground sends existing backgroundInfo', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      headers: { get: function() { return 'application/json'; } },
      json: async function() {
        return {
          text: 'Revised background with references.',
          sources: [],
          searchBackend: 'duckduckgo',
          model: 'test-model',
          title: 'Wild Rover',
          artist: 'Dubliners',
        };
      },
    });

    const result = await researchTuneBackground({
      title: 'Wild Rover',
      artist: 'Dubliners',
      lyrics: 'I\'ve been a wild rover',
      backgroundInfo: 'Known as a drinking song.',
      accessToken: 'token',
    });

    expect(result.text).toBe('Revised background with references.');
    expect(fetchViaMediaProxy).toHaveBeenCalled();
    const call = fetchViaMediaProxy.mock.calls[0];
    expect(call[0]).toBe('/research-tune-background');
    const body = JSON.parse(call[2].body);
    expect(body.backgroundInfo).toBe('Known as a drinking song.');
    expect(body.lyrics).toBe('I\'ve been a wild rover');
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

  test('lyricsSearchPhrases defaults to one phrase', function() {
    expect(lyricsSearchPhrases('[Verse 1]\nGet you a copper kettle\nFill it full of corn')).toEqual([
      'Get you a copper kettle',
    ]);
  });

  test('lyricsSearchPhrases skips section headers', function() {
    expect(lyricsSearchPhrases('[Verse 1]\nGet you a copper kettle\nFill it full of corn', 2)).toEqual([
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
    expect(queries).toHaveLength(6);
    expect(queries.some(function(query) { return query.indexOf('"Wild Rover" "Dubliners" song history origin recording') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('"Wild Rover" "Dubliners" covers performers recordings') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('site:thesession.org "Wild Rover"') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('site:discogs.com "Wild Rover" Dubliners') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('"Get you a copper kettle" "Dubliners"') >= 0; })).toBe(true);
    expect(queries.some(function(query) { return query.indexOf('youtube.com') >= 0; })).toBe(false);
    expect(queries.some(function(query) { return query.indexOf('wikipedia') >= 0; })).toBe(false);
    expect(queries.some(function(query) { return query.indexOf('Fill it full of corn') >= 0; })).toBe(false);
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
    expect(query).toContain('song history origin recording');
    expect(query).toContain('covers performers recordings');
    expect(query).toContain('site:thesession.org');
    expect(query).not.toContain('site:youtube.com');
    expect(query).not.toContain('first recorded written');
  });

  test('buildTuneBackgroundSearchUrl uses a plain-English background question', function() {
    const longLyrics = 'Get you a copper kettle and a copper coil\n'.repeat(40);
    const url = buildTuneBackgroundSearchUrl('Copper Kettle', 'Joan Baez', longLyrics);
    expect(url.indexOf('https://www.google.com/search?q=')).toBe(0);
    expect(url.length).toBeLessThanOrEqual(2048);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('history and background');
    expect(decoded).toContain('Copper Kettle');
    expect(decoded).toContain('Joan Baez');
  });
});
