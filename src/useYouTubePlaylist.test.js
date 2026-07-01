import { parseYouTubePlaylistId } from './useYouTubePlaylist';

describe('parseYouTubePlaylistId', function() {
  test('accepts bare playlist id', function() {
    expect(parseYouTubePlaylistId('PLrAXtmRdnEQy6nuLMH8k1qE')).toBe('PLrAXtmRdnEQy6nuLMH8k1qE');
  });

  test('extracts list param from playlist url', function() {
    expect(parseYouTubePlaylistId('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
  });

  test('extracts list param from watch url', function() {
    expect(parseYouTubePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLwatch123')).toBe('PLwatch123');
  });

  test('returns empty for invalid input', function() {
    expect(parseYouTubePlaylistId('')).toBe('');
    expect(parseYouTubePlaylistId('   ')).toBe('');
    expect(parseYouTubePlaylistId('not a playlist')).toBe('');
  });
});
