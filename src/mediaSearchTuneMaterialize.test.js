import {
  MYMEDIA_BOOK,
  buildCollectionTuneFromCandidate,
  buildWebMediaTuneFromCandidate,
  createMediaSearchTuneLookup,
  findExistingMediaSearchTune,
  isMaterializableMediaSearchCandidate,
  materializeKey,
  scheduleMediaSearchTuneEnrichment,
} from './mediaSearchTuneMaterialize';
import { runAddTuneAutoEnrich, isAddTuneAutoEnrichPending } from './addTuneAutoEnrich';

jest.mock('./addTuneAutoEnrich', function() {
  return {
    runAddTuneAutoEnrich: jest.fn(function() { return Promise.resolve(true); }),
    isAddTuneAutoEnrichPending: jest.fn(function() { return false; }),
  };
});

describe('mediaSearchTuneMaterialize', function() {
  beforeEach(function() {
    runAddTuneAutoEnrich.mockClear();
    isAddTuneAutoEnrichPending.mockClear();
  });

  test('materializeKey distinguishes collection and device sources', function() {
    expect(materializeKey({ source: 'music-collection', id: '1', path: 'a.mp3' }))
      .toBe('music-collection:path:a.mp3');
    expect(materializeKey({ source: 'device-file', uri: 'content://1' }))
      .toBe('device-file:content://1');
    expect(materializeKey({
      source: 'bandcamp',
      link: 'https://artist.bandcamp.com/track/song',
    })).toBe('bandcamp:https://artist.bandcamp.com/track/song');
  });

  test('isMaterializableMediaSearchCandidate includes web media sources', function() {
    expect(isMaterializableMediaSearchCandidate({ source: 'bandcamp', link: 'https://x.bandcamp.com/track/a' }))
      .toBe(true);
    expect(isMaterializableMediaSearchCandidate({ source: 'internet-archive', link: 'https://archive.org/details/foo' }))
      .toBe(true);
    expect(isMaterializableMediaSearchCandidate({ source: 'youtube', id: 'abc123XYZ12' }))
      .toBe(true);
  });

  test('buildWebMediaTuneFromCandidate maps bandcamp with cache lock', function() {
    const tune = buildWebMediaTuneFromCandidate({
      source: 'bandcamp',
      title: 'Track',
      artist: 'Band',
      link: 'https://artist.bandcamp.com/track/track',
    });
    expect(tune.books).toEqual([MYMEDIA_BOOK]);
    expect(tune.links[0].source).toBe('bandcamp');
    expect(tune.mediaCacheLocked).toBe(true);
  });

  test('buildWebMediaTuneFromCandidate does not lock youtube cache', function() {
    const tune = buildWebMediaTuneFromCandidate({
      source: 'youtube',
      id: 'abc123XYZ12',
      title: 'Video',
    });
    expect(tune.links[0].link).toContain('abc123XYZ12');
    expect(tune.mediaCacheLocked).toBeUndefined();
  });

  test('findExistingMediaSearchTune matches bandcamp link', function() {
    const tunes = {
      t1: {
        id: 't1',
        links: [{ link: 'https://artist.bandcamp.com/track/song', source: 'bandcamp' }],
      },
    };
    const found = findExistingMediaSearchTune(tunes, {
      source: 'bandcamp',
      link: 'https://artist.bandcamp.com/track/song',
      title: 'Song',
    });
    expect(found && found.id).toBe('t1');
  });

  test('buildCollectionTuneFromCandidate maps metadata into mymedia tune', function() {
    const tune = buildCollectionTuneFromCandidate({
      id: '9',
      title: 'Sally Gardens',
      artist: 'Altan',
      album: 'The Gap',
      genre: 'Folk',
      year: '1998',
      composer: 'Traditional',
      tracknumber: '2',
      albumartist: 'Various',
      path: 'Altan/sally.mp3',
      link: 'http://localhost/music-collection/Altan/sally.mp3',
      image: 'http://localhost/art/9',
    });
    expect(tune.name).toBe('Sally Gardens');
    expect(tune.composer).toBe('Altan');
    expect(tune.books).toEqual([MYMEDIA_BOOK]);
    expect(tune.albums).toEqual(['The Gap']);
    expect(tune.genres).toEqual(['Folk']);
    expect(tune.tags).toEqual([]);
    expect(tune.mediaCacheLocked).toBe(true);
    expect(tune.links[0].collectionEntryId).toBe('9');
    expect(tune.links[0].collectionPath).toBe('Altan/sally.mp3');
    expect(tune.backgroundInfo).toContain('Traditional');
  });

  test('findExistingMediaSearchTune matches collection entry id', function() {
    const tunes = {
      t1: {
        id: 't1',
        links: [{ link: 'http://x/a.mp3', collectionEntryId: '42' }],
      },
    };
    const found = findExistingMediaSearchTune(tunes, {
      source: 'music-collection',
      id: '42',
      link: 'http://other/b.mp3',
    });
    expect(found && found.id).toBe('t1');
  });

  test('createMediaSearchTuneLookup finds collection entry without scanning all tunes', function() {
    const lookup = createMediaSearchTuneLookup({
      t1: {
        id: 't1',
        links: [{ link: 'http://x/a.mp3', collectionEntryId: '42' }],
      },
    });
    const found = lookup.find({
      source: 'music-collection',
      id: '42',
      link: 'http://other/b.mp3',
    });
    expect(found && found.id).toBe('t1');
  });

  test('materializeKey treats same collection path with different ids as one file', function() {
    const left = materializeKey({
      source: 'music-collection',
      id: '1',
      path: 'Metallica/song.mp3',
      link: '/music-collection/Metallica/song.mp3',
    });
    const right = materializeKey({
      source: 'music-collection',
      id: '2',
      path: 'Metallica/song.mp3',
      link: 'http://localhost/music-collection/Metallica/song.mp3',
    });
    expect(left).toBe(right);
  });

  test('findExistingMediaSearchTune matches device file uri', function() {
    const tunes = {
      t1: {
        id: 't1',
        links: [{ link: 'abcbook-recording:1', deviceFileUri: 'content://track/1' }],
      },
    };
    const found = findExistingMediaSearchTune(tunes, {
      source: 'device-file',
      uri: 'content://track/1',
      title: 'Song',
      artist: 'Band',
    });
    expect(found && found.id).toBe('t1');
  });

  test('findExistingMediaSearchTune matches collection by artist/title when paths differ', function() {
    const tunes = {
      t1: {
        id: 't1',
        name: 'Día luna... Día pena',
        composer: 'Manu Chao',
        books: ['mymedia'],
        links: [{ link: '/music-collection/Manu/a.mp3', collectionPath: 'Manu/a.mp3' }],
      },
    };
    const found = findExistingMediaSearchTune(tunes, {
      source: 'music-collection',
      id: '2',
      title: 'Dia Luna... Dia Pena',
      artist: 'Manu Chao',
      path: 'Manu/b.mp3',
      link: '/music-collection/Manu/b.mp3',
    });
    expect(found && found.id).toBe('t1');
  });

  test('createMediaSearchTuneLookup finds collection entry by artist/title', function() {
    const lookup = createMediaSearchTuneLookup({
      t1: {
        id: 't1',
        name: 'Malegría',
        composer: 'Manu Chao',
        books: ['mymedia'],
        links: [{ link: '/music-collection/Manu/malegria.mp3', collectionPath: 'Manu/malegria.mp3' }],
      },
    });
    const found = lookup.find({
      source: 'music-collection',
      id: '9',
      title: 'Malegria',
      artist: 'Manu Chao',
      path: 'Manu/malegria-alt.mp3',
    });
    expect(found && found.id).toBe('t1');
  });

  test('scheduleMediaSearchTuneEnrichment calls runAddTuneAutoEnrich once', function() {
    const tune = { id: 't1', name: 'Song', composer: 'Band' };
    const tunebook = { saveTune: jest.fn() };
    scheduleMediaSearchTuneEnrichment(tune, tunebook, {
      accessToken: 'token',
      resolverAvailable: true,
    });
    expect(runAddTuneAutoEnrich).toHaveBeenCalledTimes(1);
    expect(runAddTuneAutoEnrich.mock.calls[0][0].tune).toBe(tune);
  });

  test('scheduleMediaSearchTuneEnrichment skips music-collection tunes', function() {
    const tune = {
      id: 't1',
      name: 'Song',
      composer: 'Band',
      links: [{ link: '/music-collection/a.mp3', source: 'music-collection' }],
    };
    const tunebook = { saveTune: jest.fn() };
    scheduleMediaSearchTuneEnrichment(tune, tunebook, {
      accessToken: 'token',
      resolverAvailable: true,
    });
    expect(runAddTuneAutoEnrich).not.toHaveBeenCalled();
  });
});
