import { processReviewResult } from './addSongModalHelper'

describe('processReviewResult', () => {
  test('inline merges single abc candidate when stayOnForm', () => {
    const tune = { name: 'Test Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'abc', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn()
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.closeModal).toBe(false)
    expect(outcome.inline).toBe(true)
    expect(applied).toHaveBeenCalledWith(tune)
    expect(toast.success).toHaveBeenCalledWith('Imported into form')
    expect(started).not.toHaveBeenCalled()
  })

  test('queues review for non-inline sources but keeps form open when stayOnForm', () => {
    const tune = { name: 'Audio Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'audio', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn()
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const outcome = processReviewResult(result, importContext, applied, started, toast)
    expect(outcome.handled).toBe(true)
    expect(outcome.closeModal).toBe(false)
    expect(outcome.inline).toBe(false)
    expect(applied).not.toHaveBeenCalled()
    expect(started).toHaveBeenCalledWith(result.candidates)
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
    expect(started).toHaveBeenCalledWith(result.candidates)
  })
})
