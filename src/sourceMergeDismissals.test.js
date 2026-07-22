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

  test('applyMergeDismissalState records rejected and clears accepted', function() {
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
    expect(isSourceMergeDismissed('source-a', 't2', batch.records[1].incomingTune)).toBe(false);
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
});
