import {
  parseBulkLine,
  formatBulkLine,
  normalizeBulkTextLocally,
  bulkLinesToCandidates,
} from './bulkListFormat';

describe('bulkListFormat', function() {
  test('parseBulkLine handles title by artist and link', function() {
    expect(parseBulkLine('Wild Rover by The Dubliners | https://youtu.be/x')).toEqual({
      title: 'Wild Rover',
      artist: 'The Dubliners',
      link: 'https://youtu.be/x',
    });
  });

  test('formatBulkLine round trips simple rows', function() {
    const line = formatBulkLine({ title: 'Tune', artist: 'Artist', link: 'https://example.com' });
    expect(line).toBe('Tune by Artist | https://example.com');
  });

  test('normalizeBulkTextLocally drops blank lines', function() {
    const text = 'First\n\nSecond by Someone';
    expect(normalizeBulkTextLocally(text).split('\n').length).toBe(2);
  });

  test('bulkLinesToCandidates builds minimal tunes', function() {
    const candidates = bulkLinesToCandidates(['My Song by Me'], {}, 'songs');
    expect(candidates.length).toBe(1);
    expect(candidates[0].tune.name).toBe('My Song');
    expect(candidates[0].tune.composer).toBe('Me');
    expect(candidates[0].sourceKind).toBe('bulk-text');
  });
});
