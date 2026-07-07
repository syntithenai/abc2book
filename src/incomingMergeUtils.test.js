import {
  buildSourceUrlMergeRecords,
  summarizeMergeRecords,
} from './incomingMergeUtils';

describe('incomingMergeUtils source URL merge', function() {
  test('buildSourceUrlMergeRecords skips updates when local tunebook is newer', function() {
    const localTunes = {
      t1: {
        id: 't1',
        name: 'Edited locally',
        lastUpdated: 500,
        voices: { '1': { notes: ['G2'] } },
      },
    };
    const incomingById = {
      t1: {
        id: 't1',
        name: 'Repo export',
        lastUpdated: 100,
        voices: { '1': { notes: ['D2'] } },
      },
    };
    expect(buildSourceUrlMergeRecords(localTunes, incomingById)).toEqual([]);
  });

  test('buildSourceUrlMergeRecords includes updates when source file is newer', function() {
    const localTunes = {
      t1: {
        id: 't1',
        name: 'Local copy',
        lastUpdated: 100,
        voices: { '1': { notes: ['G2'] } },
      },
    };
    const incomingById = {
      t1: {
        id: 't1',
        name: 'Repo export',
        lastUpdated: 500,
        voices: { '1': { notes: ['D2'] } },
      },
    };
    const records = buildSourceUrlMergeRecords(localTunes, incomingById);
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe('update');
    expect(records[0].localTune.name).toBe('Local copy');
    expect(records[0].incomingTune.name).toBe('Repo export');
  });

  test('buildSourceUrlMergeRecords matches existing collection tunes without srcUrl', function() {
    const localTunes = {
      existing: {
        id: 'existing',
        name: 'Already here',
        lastUpdated: 500,
        title: 'Already here',
        tempo: 100,
        meter: '4/4',
        key: 'G',
        voices: { '1': { notes: ['G2'] } },
      },
    };
    const incomingById = {
      repo: {
        id: 'repo',
        name: 'Already here',
        lastUpdated: 100,
        title: 'Already here',
        tempo: 100,
        meter: '4/4',
        key: 'G',
        voices: { '1': { notes: ['G2'] } },
      },
    };
    const getTuneImportHash = function(tune) {
      return [
        tune.title || tune.name,
        tune.tempo,
        tune.meter,
        tune.key,
        tune.voices && tune.voices['1'] ? tune.voices['1'].notes.join('') : '',
      ].join('|');
    };
    expect(buildSourceUrlMergeRecords(localTunes, incomingById, getTuneImportHash)).toEqual([]);
  });

  test('buildSourceUrlMergeRecords treats import-hash matches as updates', function() {
    const localTunes = {
      localid: {
        id: 'localid',
        name: 'Same tune',
        lastUpdated: 100,
        title: 'Same tune',
        tempo: 100,
        meter: '4/4',
        key: 'G',
        voices: { '1': { notes: ['G2'] } },
      },
    };
    const incomingById = {
      repoid: {
        id: 'repoid',
        name: 'Same tune renamed in repo',
        lastUpdated: 500,
        title: 'Same tune',
        tempo: 100,
        meter: '4/4',
        key: 'G',
        voices: { '1': { notes: ['G2'] } },
      },
    };
    const getTuneImportHash = function(tune) {
      return [
        tune.title || tune.name,
        tune.tempo,
        tune.meter,
        tune.key,
        tune.voices && tune.voices['1'] ? tune.voices['1'].notes.join('') : '',
      ].join('|');
    };
    const records = buildSourceUrlMergeRecords(localTunes, incomingById, getTuneImportHash);
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe('update');
    expect(records[0].id).toBe('localid');
  });

  test('buildSourceUrlMergeRecords still adds new source tunes', function() {
    const records = buildSourceUrlMergeRecords({}, {
      t2: { id: 't2', name: 'New in repo', lastUpdated: 100 },
    });
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe('insert');
  });

  test('summarizeMergeRecords counts visible records only', function() {
    const summary = summarizeMergeRecords([
      { kind: 'update' },
      { kind: 'insert' },
    ]);
    expect(summary).toBe('1 to add, 1 to update');
  });
});
