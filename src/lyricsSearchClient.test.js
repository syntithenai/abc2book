import { normalizeLyricsSearch, handleLyricsSearchStreamEvent } from './lyricsSearchClient';

describe('lyricsSearchClient', function() {
  test('normalizeLyricsSearch maps stanza response', function() {
    const result = normalizeLyricsSearch({
      text: 'Line one\nLine two\n\nChorus',
      lines: ['Line one', 'Line two', '', 'Chorus'],
      stanzas: [['Line one', 'Line two'], ['Chorus']],
      source: 'lyrics.ovh',
      sourceUrl: 'https://api.lyrics.ovh/v1/Artist/Title',
      title: 'Title',
      artist: 'Artist',
    });

    expect(result.multiple).toBe(false);
    expect(result.text).toBe('Line one\nLine two\n\nChorus');
    expect(result.lines).toEqual(['Line one', 'Line two', '', 'Chorus']);
    expect(result.stanzas).toEqual([['Line one', 'Line two'], ['Chorus']]);
    expect(result.source).toBe('lyrics.ovh');
  });

  test('normalizeLyricsSearch rejects empty text', function() {
    expect(function() {
      normalizeLyricsSearch({ text: '   ' });
    }).toThrow('Lyrics search returned no text');
  });

  test('handleLyricsSearchStreamEvent forwards progress', function() {
    const updates = [];
    handleLyricsSearchStreamEvent({
      type: 'progress',
      message: 'Checking lyrics.ovh...',
      progress: 0.15,
      stage: 'search',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage });
    });
    expect(updates).toEqual([{
      message: 'Checking lyrics.ovh...',
      progress: 0.15,
      stage: 'search',
    }]);
  });

  test('handleLyricsSearchStreamEvent returns result events', function() {
    const result = handleLyricsSearchStreamEvent({
      type: 'result',
      body: {
        text: 'Line one\nLine two',
        lines: ['Line one', 'Line two'],
        source: 'lyrics.ovh',
      },
    }, function() {});
    expect(result.multiple).toBe(false);
    expect(result.text).toBe('Line one\nLine two');
    expect(result.source).toBe('lyrics.ovh');
  });

  test('normalizeLyricsSearch maps candidate responses', function() {
    const result = normalizeLyricsSearch({
      multiple: true,
      candidates: [{
        text: 'Get you a copper kettle',
        lines: ['Get you a copper kettle'],
        source: 'genius.com',
        sourceUrl: 'https://genius.com/example',
        title: 'Copper Kettle',
        artist: 'Joan Baez',
        preview: 'Get you a copper kettle',
        titleOnly: false,
      }, {
        text: 'Title-only version',
        lines: ['Title-only version'],
        source: 'lyrics.com',
        sourceUrl: 'https://lyrics.com/example',
        title: 'Copper Kettle',
        artist: '',
        preview: 'Title-only version',
        titleOnly: true,
      }],
    });

    expect(result.multiple).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[1].titleOnly).toBe(true);
  });
});
