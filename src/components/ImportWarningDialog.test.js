import { isImportNotificationOnly } from './ImportWarningDialog';

describe('isImportNotificationOnly', function() {
  test('true when only localUpdates and skippedUpdates', function() {
    expect(isImportNotificationOnly({
      inserts: 0,
      updates: 0,
      localUpdates: 6,
      skippedUpdates: 79,
      deletes: 0,
      duplicates: 0,
    })).toBe(true);
  });

  test('true when only skippedUpdates', function() {
    expect(isImportNotificationOnly({
      inserts: 0,
      updates: 0,
      localUpdates: 0,
      skippedUpdates: 10,
      deletes: 0,
      duplicates: 0,
    })).toBe(true);
  });

  test('false when inserts need a merge decision', function() {
    expect(isImportNotificationOnly({
      inserts: 2,
      updates: 0,
      localUpdates: 1,
      skippedUpdates: 5,
      deletes: 0,
      duplicates: 0,
    })).toBe(false);
  });

  test('false when empty', function() {
    expect(isImportNotificationOnly({
      inserts: 0,
      updates: 0,
      localUpdates: 0,
      skippedUpdates: 0,
      deletes: 0,
      duplicates: 0,
    })).toBe(false);
  });
});
