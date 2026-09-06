import {
  buildSourceUrlMergeRecords,
  summarizeMergeRecords,
  isMassDeleteBatch,
  stripMassDeletesFromSheetResults,
  sanitizeRemoteDeletedAgainstLocalTunes,
  splitSourceUrlMergeRecords,
  isSourceUrlTuneClash,
} from './incomingMergeUtils';
import { recordSourceSyncBaseline } from './sourceSyncBaseline';

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

  test('buildSourceUrlMergeRecords skips locally deleted tunes', function() {
    const records = buildSourceUrlMergeRecords({}, {
      t2: { id: 't2', name: 'Deleted before', lastUpdated: 100 },
    }, null, {
      deletedTunes: {
        t2: { id: 't2', deletedAt: Date.now() },
      },
    });
    expect(records).toEqual([]);
  });

  test('buildSourceUrlMergeRecords skips dismissed incoming', function() {
    const incoming = { id: 't1', name: 'Remote', lastUpdated: 500, voices: { '1': { notes: ['D2'] } } };
    const records = buildSourceUrlMergeRecords({
      t1: { id: 't1', name: 'Local', lastUpdated: 100, voices: { '1': { notes: ['G2'] } } },
    }, { t1: incoming }, null, {
      sourceKey: 'source-a',
      deletedTunes: {},
    });
    expect(records).toHaveLength(1);
    const { recordSourceMergeDismissal } = require('./sourceMergeDismissals');
    recordSourceMergeDismissal('source-a', 't1', incoming);
    expect(buildSourceUrlMergeRecords({
      t1: { id: 't1', name: 'Local', lastUpdated: 100, voices: { '1': { notes: ['G2'] } } },
    }, { t1: incoming }, null, {
      sourceKey: 'source-a',
    })).toEqual([]);
  });

  test('summarizeMergeRecords counts visible records only', function() {
    const summary = summarizeMergeRecords([
      { kind: 'update' },
      { kind: 'insert' },
    ]);
    expect(summary).toBe('1 to add, 1 to update');
  });
});

describe('splitSourceUrlMergeRecords', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('insert records go to silent bucket', function() {
    const records = [{ id: 't2', kind: 'insert', incomingTune: { id: 't2', lastUpdated: 100 } }];
    const split = splitSourceUrlMergeRecords(records, 'source-a');
    expect(split.silentRecords).toHaveLength(1);
    expect(split.clashRecords).toHaveLength(0);
    expect(split.seededIds).toEqual([]);
  });

  test('incoming newer update without local edit since baseline is silent', function() {
    recordSourceSyncBaseline('source-a', 't1', { lastUpdated: 100 }, { lastUpdated: 100 });
    const records = [{
      id: 't1',
      kind: 'update',
      localTune: { id: 't1', lastUpdated: 100 },
      incomingTune: { id: 't1', lastUpdated: 500 },
    }];
    const split = splitSourceUrlMergeRecords(records, 'source-a');
    expect(split.silentRecords).toHaveLength(1);
    expect(split.clashRecords).toHaveLength(0);
  });

  test('incoming newer update after local edit is clash', function() {
    recordSourceSyncBaseline('source-a', 't1', { lastUpdated: 100 }, { lastUpdated: 100 });
    const record = {
      id: 't1',
      kind: 'update',
      localTune: { id: 't1', lastUpdated: 200 },
      incomingTune: { id: 't1', lastUpdated: 500 },
    };
    expect(isSourceUrlTuneClash(record, 'source-a')).toBe(true);
    const split = splitSourceUrlMergeRecords([record], 'source-a');
    expect(split.clashRecords).toHaveLength(1);
    expect(split.silentRecords).toHaveLength(0);
  });

  test('legacy tune without baseline is seeded only on first poll', function() {
    const records = [{
      id: 't1',
      kind: 'update',
      localTune: { id: 't1', lastUpdated: 100 },
      incomingTune: { id: 't1', lastUpdated: 500 },
    }];
    const split = splitSourceUrlMergeRecords(records, 'source-a');
    expect(split.silentRecords).toHaveLength(0);
    expect(split.clashRecords).toHaveLength(0);
    expect(split.seededIds).toEqual(['t1']);
  });
});

describe('mass delete guards', function() {
  test('isMassDeleteBatch uses absolute and fraction thresholds', function() {
    expect(isMassDeleteBatch(0, 1000)).toBe(false);
    expect(isMassDeleteBatch(49, 1000)).toBe(false);
    expect(isMassDeleteBatch(50, 1000)).toBe(true);
    expect(isMassDeleteBatch(30, 100)).toBe(true);
    expect(isMassDeleteBatch(20, 100)).toBe(false);
  });

  test('stripMassDeletesFromSheetResults clears wipe-sized delete lists', function() {
    const deletes = {};
    for (let i = 0; i < 80; i += 1) deletes['t' + i] = { id: 't' + i };
    const stripped = stripMassDeletesFromSheetResults({
      inserts: { a: { id: 'a' } },
      deletes: deletes,
    }, 3000);
    expect(stripped.inserts).toEqual({ a: { id: 'a' } });
    expect(stripped.deletes).toEqual({});
  });

  test('sanitizeRemoteDeletedAgainstLocalTunes drops tombstones for live local tunes', function() {
    const remoteDeleted = {};
    for (let i = 0; i < 60; i += 1) {
      remoteDeleted['t' + i] = { id: 't' + i, deletedAt: 1 };
    }
    const localTunes = { t0: { id: 't0' }, t1: { id: 't1' }, missing: { id: 'missing' } };
    const cleaned = sanitizeRemoteDeletedAgainstLocalTunes(remoteDeleted, localTunes);
    expect(cleaned.t0).toBeUndefined();
    expect(cleaned.t1).toBeUndefined();
    expect(cleaned.t2).toEqual({ id: 't2', deletedAt: 1 });
    expect(cleaned.missing).toBeUndefined();
  });
});
