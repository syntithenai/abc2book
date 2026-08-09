import { applySourceUrlMergeBatch } from './sourceUrlSync';

describe('applySourceUrlMergeBatch', function() {
  test('stamps srcUrl on inserted and updated tunes', function() {
    const batch = {
      sourceUrl: '/scrape/songs.abc',
      records: [
        {
          id: 'new1',
          kind: 'insert',
          incomingTune: { id: 'new1', name: 'New song', lastUpdated: 100 },
        },
        {
          id: 't1',
          kind: 'update',
          localTune: { id: 't1', name: 'Local', lastUpdated: 100, srcUrl: 'https://tunebook.net/scrape/songs.abc' },
          incomingTune: { id: 't1', name: 'Remote', lastUpdated: 500 },
        },
      ],
    };
    const next = applySourceUrlMergeBatch({}, batch, null);
    expect(next.new1.srcUrl).toBe('/scrape/songs.abc');
    expect(next.t1.srcUrl).toBe('https://tunebook.net/scrape/songs.abc');
    expect(next.t1.name).toBe('Remote');
  });

  test('strips personal fields on insert and preserves local personal fields on update', function() {
    const batch = {
      sourceUrl: '/scrape/songs.abc',
      records: [
        {
          id: 'new1',
          kind: 'insert',
          incomingTune: {
            id: 'new1',
            name: 'New song',
            lastUpdated: 100,
            boost: 8,
            viewMode: 'music',
          },
        },
        {
          id: 't1',
          kind: 'update',
          localTune: {
            id: 't1',
            name: 'Local',
            lastUpdated: 100,
            boost: 4,
            viewMode: 'notation',
            playbackTempo: 1.25,
          },
          incomingTune: {
            id: 't1',
            name: 'Remote',
            lastUpdated: 500,
            boost: 9,
            viewMode: 'music',
            playbackTempo: 0.5,
          },
        },
      ],
    };
    const next = applySourceUrlMergeBatch({}, batch, null);
    expect(next.new1.boost).toBe(0);
    expect(next.new1.viewMode).toBeUndefined();
    expect(next.t1.name).toBe('Remote');
    expect(next.t1.boost).toBe(4);
    expect(next.t1.viewMode).toBe('notation');
    expect(next.t1.playbackTempo).toBe(1.25);
  });
});
