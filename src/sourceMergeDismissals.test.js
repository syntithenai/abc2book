/**
 * @jest-environment jsdom
 */

import {
  applyMergeDismissalState,
  clearSourceMergeDismissal,
  dismissEntireMergeBatch,
  isSourceMergeDismissed,
  recordSourceMergeDismissal,
} from './sourceMergeDismissals';

describe('sourceMergeDismissals', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('dismissed incoming is hidden until source changes', function() {
    const incoming = { id: 't1', name: 'Remote', lastUpdated: 500 };
    recordSourceMergeDismissal('source-a', 't1', incoming);
    expect(isSourceMergeDismissed('source-a', 't1', incoming)).toBe(true);
    expect(isSourceMergeDismissed('source-a', 't1', { id: 't1', lastUpdated: 600 })).toBe(false);
  });

  test('applyMergeDismissalState records both rejected and accepted incoming versions', function() {
    const batch = {
      sourceKey: 'source-a',
      records: [
        { id: 't1', incomingTune: { id: 't1', lastUpdated: 100 } },
        { id: 't2', incomingTune: { id: 't2', lastUpdated: 200 } },
      ],
    };
    applyMergeDismissalState('source-a', batch, {
      t1: { accept: false },
      t2: { accept: true },
    });
    expect(isSourceMergeDismissed('source-a', 't1', batch.records[0].incomingTune)).toBe(true);
    expect(isSourceMergeDismissed('source-a', 't2', batch.records[1].incomingTune)).toBe(true);
    // A newer incoming copy from the same source must still be offered.
    expect(isSourceMergeDismissed('source-a', 't2', { id: 't2', lastUpdated: 300 })).toBe(false);
    clearSourceMergeDismissal('source-a', 't1');
    expect(isSourceMergeDismissed('source-a', 't1', batch.records[0].incomingTune)).toBe(false);
  });

  test('dismissEntireMergeBatch dismisses all records', function() {
    const batch = {
      records: [
        { id: 't1', incomingTune: { id: 't1', lastUpdated: 100 } },
        { id: 't2', incomingTune: { id: 't2', lastUpdated: 200 } },
      ],
    };
    dismissEntireMergeBatch('source-b', batch);
    expect(isSourceMergeDismissed('source-b', 't1', batch.records[0].incomingTune)).toBe(true);
    expect(isSourceMergeDismissed('source-b', 't2', batch.records[1].incomingTune)).toBe(true);
  });

  test('accepted Google merge version is not rebuilt as an incoming record', function() {
    const { buildDriveMergeRecords } = require('./incomingMergeUtils');
    const local = { id: 't1', name: 'Local', lastUpdated: 100, voices: { 1: { notes: ['C'] } }, key: 'C', meter: '4/4' };
    const incoming = { id: 't1', name: 'Remote', lastUpdated: 200, voices: { 1: { notes: ['C'] } }, key: 'C', meter: '4/4' };
    const results = {
      inserts: {},
      updates: { t1: [local, incoming] },
      deletes: {},
    };
    expect(buildDriveMergeRecords(results, { sourceKey: 'drive-doc' }).map(function(r) { return r.id; })).toEqual(['t1']);
    applyMergeDismissalState('drive-doc', {
      records: [{ id: 't1', kind: 'update', incomingTune: incoming, localTune: local }],
    }, { t1: { accept: true, fieldSelections: { name: true } } });
    // Same incoming version must not reappear after Apply selected.
    expect(buildDriveMergeRecords(results, { sourceKey: 'drive-doc' })).toEqual([]);
  });
});
