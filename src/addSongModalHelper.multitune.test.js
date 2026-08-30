import { processReviewResult } from './addSongModalHelper';

describe('processReviewResult multi-tune redirect', function() {
  test('redirects when maxCandidates exceeded', function() {
    const startImportReview = jest.fn();
    const toastLib = { info: jest.fn(), success: jest.fn() };
    const result = processReviewResult(
      {
        action: 'review',
        candidates: [
          { tune: { name: 'A' }, sourceKind: 'abc' },
          { tune: { name: 'B' }, sourceKind: 'abc' },
        ],
      },
      { maxCandidates: 1, entryPoint: 'editor', stayOnForm: true },
      jest.fn(),
      startImportReview,
      toastLib
    );
    expect(result.bulkReviewRequired).toBe(true);
    expect(startImportReview).toHaveBeenCalled();
    expect(toastLib.info.mock.calls[0][0]).toMatch(/2 tunes/);
  });

  test('inline apply for single stayOnForm candidate', function() {
    const apply = jest.fn(function() { return true });
    const startImportReview = jest.fn();
    const result = processReviewResult(
      {
        action: 'review',
        candidates: [{ tune: { name: 'Solo' }, sourceKind: 'abc' }],
      },
      { stayOnForm: true },
      apply,
      startImportReview,
      { success: jest.fn() }
    );
    expect(result.inline).toBe(true);
    expect(apply).toHaveBeenCalled();
    expect(startImportReview).not.toHaveBeenCalled();
  });

  test('does not inline when single candidate merges an existing library tune', function() {
    const apply = jest.fn();
    const startImportReview = jest.fn();
    const result = processReviewResult(
      {
        action: 'review',
        candidates: [{
          tune: { name: 'Chuperlika', id: 't1' },
          sourceKind: 'abc',
          mergeTargetId: 't1',
          mergeStatus: 'exactId',
          mergeMode: 'direct',
        }],
      },
      { stayOnForm: true, entryPoint: 'add' },
      apply,
      startImportReview,
      { success: jest.fn() }
    );
    expect(result.inline).toBe(false);
    expect(result.closeModal).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(startImportReview).toHaveBeenCalled();
  });
});
