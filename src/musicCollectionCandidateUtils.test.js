import { buildMusicCollectionCandidateFromEntry } from './musicCollectionCandidateUtils';

describe('buildMusicCollectionCandidateFromEntry', function() {
  test('maps entry fields into music-collection candidate', function() {
    const candidate = buildMusicCollectionCandidateFromEntry({
      id: '42',
      title: 'Sally Gardens',
      artist: 'Altan',
      album: 'The Gap',
      genre: 'Folk',
      path: 'Altan/sally.mp3',
      duration: 125,
    }, 'https://resolver.example');

    expect(candidate.source).toBe('music-collection');
    expect(candidate.title).toBe('Sally Gardens');
    expect(candidate.artist).toBe('Altan');
    expect(candidate.link).toBe('https://resolver.example/music-collection/Altan/sally.mp3');
    expect(candidate.image).toBe('https://resolver.example/music-collection-art/42');
    expect(candidate.description).toBe('The Gap · 2:05');
    expect(candidate.genre).toBe('Folk');
  });

  test('falls back to path metadata when tags are missing', function() {
    const candidate = buildMusicCollectionCandidateFromEntry({
      id: '7',
      path: 'Altan/The Gap/01 Altan - Sally Gardens.mp3',
    }, 'https://resolver.example');

    expect(candidate.title).toBe('Sally Gardens');
    expect(candidate.artist).toBe('Altan');
    expect(candidate.description).toBe('The Gap');
  });
});
