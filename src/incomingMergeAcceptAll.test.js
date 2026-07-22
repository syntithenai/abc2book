/**
 * @jest-environment jsdom
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { compareTuneBooks } from './tuneBookSync';
import {
  applyDriveRecordStateToTunes,
  applyRecordFieldMerge,
  buildDriveMergeRecords,
  buildFieldSelectionsForRecord,
} from './incomingMergeUtils';
import IncomingMergeModal from './components/IncomingMergeModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeTune(id, name, extra) {
  return Object.assign({
    id: id,
    name: name,
    voices: { 1: { notes: ['abc'] } },
    key: 'C',
    meter: '4/4',
    lastUpdated: 1000,
  }, extra || {});
}

function buildAcceptAllRecordState(records) {
  const state = {};
  records.forEach(function(record) {
    state[record.id] = {
      accept: true,
      fieldSelections: buildFieldSelectionsForRecord(record, true),
    };
  });
  return state;
}

describe('incoming merge accept-all convergence', function() {
  test('accept-all resolves every differing field so the same items do not come back as updates', function() {
    // Remote copy is newer AND its clock is ahead of this device.
    const futureTs = Date.now() + 10 * 60 * 1000;
    const localTunes = {
      t1: makeTune('t1', 'Tune One', { lastUpdated: 1000, tags: ['mytag'], boost: 3 }),
    };
    const remoteTunes = {
      t1: makeTune('t1', 'Tune One Renamed', { lastUpdated: futureTs, tags: ['othertag'], boost: 5 }),
      t2: makeTune('t2', 'Brand New Tune', { lastUpdated: 2000 }),
    };

    const results = compareTuneBooks({
      localTunes: localTunes,
      localDeleted: {},
      remoteTunes: remoteTunes,
      remoteDeleted: {},
    });
    expect(Object.keys(results.updates)).toEqual(['t1']);
    expect(Object.keys(results.inserts)).toEqual(['t2']);

    const records = buildDriveMergeRecords(results);
    const recordState = buildAcceptAllRecordState(records);
    const applied = applyDriveRecordStateToTunes(localTunes, results, recordState);

    // All differing fields taken from the remote copy, including
    // non-default-import fields like tags and boost.
    expect(applied.tunes.t1.name).toBe('Tune One Renamed');
    expect(applied.tunes.t1.tags).toEqual(expect.arrayContaining(['mytag', 'othertag']));
    expect(applied.tunes.t1.boost).toBe(5);

    // Re-comparing against the same drive content must not re-flag the
    // accepted items as incoming updates (this was the repeating-toast bug).
    const recheck = compareTuneBooks({
      localTunes: applied.tunes,
      localDeleted: {},
      remoteTunes: remoteTunes,
      remoteDeleted: {},
    });
    expect(Object.keys(recheck.updates)).toEqual([]);
    expect(Object.keys(recheck.inserts)).toEqual([]);
    expect(Object.keys(recheck.deletes)).toEqual([]);
  });

  test('applyRecordFieldMerge stamps the merge as newer than the incoming copy despite clock skew', function() {
    const futureTs = Date.now() + 10 * 60 * 1000;
    const merged = applyRecordFieldMerge({
      kind: 'update',
      localTune: makeTune('t1', 'Local', { lastUpdated: 1000, tags: ['mytag'] }),
      incomingTune: makeTune('t1', 'Remote', { lastUpdated: futureTs, tags: ['othertag'] }),
    }, { name: true });
    expect(merged.lastUpdated).toBeGreaterThan(futureTs);
  });
});

describe('IncomingMergeModal Accept All', function() {
  let container;
  let root;

  beforeEach(function() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(function() {
    act(function() { root.unmount(); });
    container.remove();
  });

  test('Accept All applies every differing field, not just recommended defaults', function() {
    const localTune = makeTune('t1', 'Local Name', { lastUpdated: 1000, tags: ['mytag'] });
    const incomingTune = makeTune('t1', 'Remote Name', { lastUpdated: 2000, tags: ['othertag'] });
    const batch = {
      kind: 'drive',
      sourceLabel: 'Google Drive tunebook',
      summary: '1 to update',
      records: [{
        id: 't1',
        kind: 'update',
        label: 'Local Name',
        localTune: localTune,
        incomingTune: incomingTune,
      }],
    };
    const onApply = jest.fn();

    act(function() {
      root.render(React.createElement(IncomingMergeModal, {
        show: true,
        batch: batch,
        onApply: onApply,
        onReject: function() {},
        onClose: function() {},
      }));
    });

    const buttons = Array.from(document.querySelectorAll('button'));
    const acceptAll = buttons.find(function(b) { return b.textContent === 'Accept All'; });
    expect(acceptAll).toBeTruthy();
    act(function() { acceptAll.click(); });

    expect(onApply).toHaveBeenCalledTimes(1);
    const recordState = onApply.mock.calls[0][0];
    expect(recordState.t1.accept).toBe(true);
    // tags is a defaultImport:false field, but Accept All must still take it.
    expect(recordState.t1.fieldSelections.tags).toBe(true);
    expect(recordState.t1.fieldSelections.name).toBe(true);
  });
});
