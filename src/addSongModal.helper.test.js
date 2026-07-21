import { processReviewResult } from './addSongModalHelper'

describe('processReviewResult', () => {
  test('inline merges single abc candidate when stayOnForm', () => {
    const tune = { name: 'Test Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'abc', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn().mockReturnValue(true)
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.closeModal).toBe(false)
    expect(outcome.inline).toBe(true)
    expect(applied).toHaveBeenCalledWith(
      tune,
      expect.objectContaining({ sourceKind: 'abc', tune: tune })
    )
    expect(toast.success).toHaveBeenCalledWith('Imported into form')
    expect(started).not.toHaveBeenCalled()
  })

  test('queues review when inline apply fails', () => {
    const tune = { name: 'Amazing Grace' }
    const result = { action: 'review', candidates: [{ sourceKind: 'chordsheet', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn().mockReturnValue(false)
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.inline).toBe(false)
    expect(applied).toHaveBeenCalled()
    expect(started).toHaveBeenCalled()
    expect(started.mock.calls[0][0][0].tune).toEqual(tune)
    expect(toast.success).not.toHaveBeenCalled()
  })

  test('inline merges single chordpro candidate when stayOnForm', () => {
    const tune = { name: 'Amazing Grace', composer: 'John Newton', words: ['[G]Amazing grace'] }
    const result = { action: 'review', candidates: [{ sourceKind: 'chordsheet', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn().mockReturnValue(true)
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.inline).toBe(true)
    expect(applied).toHaveBeenCalledWith(
      tune,
      expect.objectContaining({ sourceKind: 'chordsheet', tune: tune })
    )
    expect(started).not.toHaveBeenCalled()
  })

  test('queues review for rich/non-inline sources and leaves Add form', () => {
    const tune = { name: 'Audio Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'musicxml', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn()
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.closeModal).toBe(true)
    expect(outcome.inline).toBe(false)
    expect(applied).not.toHaveBeenCalled()
    expect(started).toHaveBeenCalled()
    expect(started.mock.calls[0][0][0].tune).toEqual(tune)
    expect(toast.info).not.toHaveBeenCalled()
  })

  test('queues review and requests modal close when not stayOnForm', () => {
    const tune = { name: 'Audio Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'audio', tune }] }
    const importContext = { stayOnForm: false }
    const applied = jest.fn()
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.closeModal).toBe(true)
    expect(started).toHaveBeenCalled()
    expect(started.mock.calls[0][0][0].tune).toEqual(tune)
  })
})
