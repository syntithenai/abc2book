import {
  ensureMediaSearchTune,
  findExistingMediaSearchTune,
  MYMEDIA_BOOK,
} from './mediaSearchTuneMaterialize';

jest.mock('./addTuneAutoEnrich', function() {
  return {
    runAddTuneAutoEnrich: jest.fn(function() { return Promise.resolve(true); }),
    isAddTuneAutoEnrichPending: jest.fn(function() { return false; }),
  };
});

describe('ensureMediaSearchTune', function() {
  test('saves a new collection tune in mymedia', async function() {
    const tunes = {};
    const tunebook = {
      tunes: tunes,
      createTune: jest.fn(function(tune) { return Object.assign({}, tune, { id: 'new-tune' }); }),
      saveTune: jest.fn(function(tune) {
        tunes[tune.id] = tune;
        return tune;
      }),
    };
    const saved = await ensureMediaSearchTune({
      source: 'music-collection',
      id: '7',
      title: 'Track',
      artist: 'Band',
      path: 'Band/track.mp3',
      link: 'http://localhost/music-collection/Band/track.mp3',
    }, tunebook, { tunes: tunes });
    expect(saved.id).toBe('new-tune');
    expect(saved.books).toEqual([MYMEDIA_BOOK]);
    expect(tunebook.saveTune).toHaveBeenCalledTimes(1);
  });

  test('reuses existing collection tune without saving again', async function() {
    const tunes = {
      existing: {
        id: 'existing',
        name: 'Track',
        links: [{ link: 'http://x', collectionEntryId: '7' }],
      },
    };
    const tunebook = {
      tunes: tunes,
      createTune: jest.fn(),
      saveTune: jest.fn(),
    };
    const saved = await ensureMediaSearchTune({
      source: 'music-collection',
      id: '7',
      title: 'Track',
      artist: 'Band',
      link: 'http://x',
    }, tunebook, { tunes: tunes });
    expect(saved.id).toBe('existing');
    expect(tunebook.saveTune).not.toHaveBeenCalled();
    expect(findExistingMediaSearchTune(tunes, { source: 'music-collection', id: '7' }).id)
      .toBe('existing');
  });
});
