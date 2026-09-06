import {
  getSourceSyncBaseline,
  recordSourceSyncBaseline,
  seedSourceSyncBaseline,
  hasLocalEditSinceSourceApply,
  readSourceSyncBaselines,
} from './sourceSyncBaseline';

describe('sourceSyncBaseline', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('recordSourceSyncBaseline stores applied and incoming timestamps', function() {
    recordSourceSyncBaseline('source-a', 't1', { lastUpdated: 100 }, { lastUpdated: 500 });
    const baseline = getSourceSyncBaseline('source-a', 't1');
    expect(baseline.appliedAt).toBe(100);
    expect(baseline.incomingAt).toBe(500);
  });

  test('seedSourceSyncBaseline only seeds once', function() {
    seedSourceSyncBaseline('source-a', 't1', { lastUpdated: 200 });
    seedSourceSyncBaseline('source-a', 't1', { lastUpdated: 999 });
    expect(getSourceSyncBaseline('source-a', 't1').appliedAt).toBe(200);
  });

  test('hasLocalEditSinceSourceApply detects user edits after baseline', function() {
    const baseline = { appliedAt: 100, incomingAt: 100 };
    expect(hasLocalEditSinceSourceApply({ lastUpdated: 100 }, baseline)).toBe(false);
    expect(hasLocalEditSinceSourceApply({ lastUpdated: 101 }, baseline)).toBe(true);
  });

  test('readSourceSyncBaselines returns empty object when unset', function() {
    expect(readSourceSyncBaselines()).toEqual({});
  });
});
