import {
  countCandidates,
  classifyMultiTuneOutcome,
  classifyImportOutcome,
  multiTuneRedirectToastMessage,
  policyForSourceKind,
} from './importIntakePolicy';

describe('importIntakePolicy', function() {
  test('countCandidates', function() {
    expect(countCandidates(null)).toBe(0);
    expect(countCandidates([{ tune: {} }, { tune: {} }])).toBe(2);
  });

  test('classifyMultiTuneOutcome requires bulk when over maxCandidates', function() {
    const outcome = classifyMultiTuneOutcome(
      [{}, {}, {}],
      { maxCandidates: 1, entryPoint: 'editor' }
    );
    expect(outcome.bulkReviewRequired).toBe(true);
    expect(outcome.candidateCount).toBe(3);
  });

  test('classifyMultiTuneOutcome allows single when max is 1', function() {
    const outcome = classifyMultiTuneOutcome([{}], { maxCandidates: 1 });
    expect(outcome.bulkReviewRequired).toBe(false);
  });

  test('classifyImportOutcome annotates skipEnrich and mergeMode', function() {
    const result = classifyImportOutcome([
      { tune: { name: 'A' }, sourceKind: 'abc' },
      { tune: { name: 'B' }, sourceKind: 'chordsheet' },
    ], {});
    expect(result.candidates[0].skipEnrich).toBe(true);
    expect(result.candidates[0].mergeMode).toBe('suggestOnly');
    expect(result.candidates[1].attachmentPolicy).toBe('suggestOnly');
  });

  test('policyForSourceKind and toast message', function() {
    expect(policyForSourceKind('mscz').attachmentPolicy).toBe('mergeNotation');
    expect(multiTuneRedirectToastMessage(12)).toContain('12 tunes');
    expect(multiTuneRedirectToastMessage(1)).toContain('1 tune');
  });
});
