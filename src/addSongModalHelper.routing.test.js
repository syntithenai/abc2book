import { processReviewResult } from './addSongModalHelper'

describe('processReviewResult add routing', function() {
  test('multi-tune always opens review with toast', function() {
    const start = jest.fn()
    const toastLib = { info: jest.fn(), success: jest.fn() }
    const outcome = processReviewResult(
      {
        action: 'review',
        candidates: [
          { sourceKind: 'abc', tune: { name: 'A' } },
          { sourceKind: 'abc', tune: { name: 'B' } },
        ],
      },
      { stayOnForm: true, entryPoint: 'add' },
      jest.fn(),
      start,
      toastLib
    )
    expect(outcome.bulkReviewRequired).toBe(true)
    expect(outcome.closeModal).toBe(true)
    expect(outcome.inline).toBe(false)
    expect(start).toHaveBeenCalled()
    expect(toastLib.info).toHaveBeenCalled()
  })

  test('single MusicXML opens Import Review (not inline)', function() {
    const apply = jest.fn()
    const start = jest.fn()
    const outcome = processReviewResult(
      {
        action: 'review',
        candidates: [{ sourceKind: 'musicxml', tune: { name: 'Solo' } }],
      },
      { stayOnForm: true, entryPoint: 'add' },
      apply,
      start,
      { success: jest.fn(), info: jest.fn() }
    )
    expect(outcome.inline).toBe(false)
    expect(outcome.closeModal).toBe(true)
    expect(apply).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalled()
  })

  test('single abc still inlines on Add', function() {
    const apply = jest.fn()
    const start = jest.fn()
    const outcome = processReviewResult(
      {
        action: 'review',
        candidates: [{ sourceKind: 'abc', tune: { name: 'Solo' } }],
      },
      { stayOnForm: true, entryPoint: 'add' },
      apply,
      start,
      { success: jest.fn() }
    )
    expect(outcome.inline).toBe(true)
    expect(apply).toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })
})
