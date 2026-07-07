import { processReviewResult } from './addSongModalHelper'

describe('processReviewResult', () => {
  test('inline merges single abc candidate when stayOnForm', () => {
    const tune = { name: 'Test Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'abc', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn()
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const handled = processReviewResult(result, importContext, applied, started, toast)
    expect(handled).toBe(true)
    expect(applied).toHaveBeenCalledWith(tune)
    expect(toast.success).toHaveBeenCalledWith('Imported into Add form')
    expect(started).not.toHaveBeenCalled()
  })

  test('queues review for non-inline sources', () => {
    const tune = { name: 'Audio Tune' }
    const result = { action: 'review', candidates: [{ sourceKind: 'audio', tune }] }
    const importContext = { stayOnForm: true }
    const applied = jest.fn()
    const started = jest.fn()
    const toast = { success: jest.fn(), info: jest.fn() }

    const handled = processReviewResult(result, importContext, applied, started, toast)
    expect(handled).toBe(true)
    expect(applied).not.toHaveBeenCalled()
    expect(started).toHaveBeenCalledWith(result.candidates)
    expect(toast.info).toHaveBeenCalledWith('Starting Source Enhancement')
  })
})
