/**
 * Tests for multi-tune join planning.
 */
import {
  planMergeWithNext,
  planMergeWithPrevious,
  planMergeTunes,
} from './bookImportCropOps'

function tune(id, page, tuneIndex, title) {
  return {
    id: id,
    page: page,
    tuneIndex: tuneIndex,
    title: title || id,
    abc: 'X:1',
    candidates: [{ id: 'c1', abc: 'X:1' }],
    cropBlobKey: 'k-' + id,
  }
}

describe('bookImportCropOps join plans', function() {
  function makeTunes() {
    return [
      tune('a', 1, 1, 'A'),
      tune('b', 1, 2, 'B'),
      tune('c', 1, 3, 'C'),
      tune('d', 2, 1, 'D'),
    ]
  }

  test('planMergeWithNext joins next on same page', function() {
    const plan = planMergeWithNext(makeTunes(), 'a')
    expect(plan).toBeTruthy()
    expect(plan.removed.id).toBe('b')
    expect(plan.mergeTarget.id).toBe('a')
    expect(plan.mergeTarget.abc).toBe('')
    expect(plan.tunes.find(function(t) { return t.id === 'b' })).toBeFalsy()
  })

  test('planMergeWithPrevious joins previous', function() {
    const plan = planMergeWithPrevious(makeTunes(), 'b')
    expect(plan).toBeTruthy()
    expect(plan.mergeTarget.id).toBe('a')
    expect(plan.removed.id).toBe('b')
  })

  test('planMergeTunes stitches consecutive selection', function() {
    const plan = planMergeTunes(makeTunes(), ['c', 'a', 'b'])
    expect(plan).toBeTruthy()
    expect(plan.mergeTarget.id).toBe('a')
    expect(plan.removed.map(function(t) { return t.id })).toEqual(['b', 'c'])
    expect(plan.tunes.filter(function(t) { return Number(t.page) === 1 })).toHaveLength(1)
  })

  test('planMergeTunes rejects non-consecutive', function() {
    expect(planMergeTunes(makeTunes(), ['a', 'c'])).toBeNull()
  })

  test('planMergeTunes rejects cross-page', function() {
    expect(planMergeTunes(makeTunes(), ['c', 'd'])).toBeNull()
  })
})
