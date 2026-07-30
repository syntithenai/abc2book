jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
    },
  }
})

import { toast } from 'react-toastify'
import {
  AUDIO_GENERATION_JOBS_TAB,
  backgroundJobsAudioGenerationPath,
  showAudioGenerationCompleteToast,
  showAudioGenerationStartedToast,
  tuneSingleViewPath,
} from './audioGenerationToast'

describe('audioGenerationToast', function() {
  beforeEach(function() {
    toast.info.mockClear()
    toast.success.mockClear()
    delete window.location
    window.location = { assign: jest.fn() }
  })

  test('backgroundJobsAudioGenerationPath targets audio generation tab', function() {
    expect(backgroundJobsAudioGenerationPath()).toBe(
      '/settings?tab=background-jobs&jobsTab=' + AUDIO_GENERATION_JOBS_TAB
    )
    expect(tuneSingleViewPath('tune-1')).toBe('/tunes/tune-1')
  })

  test('showAudioGenerationStartedToast renders View jobs button', function() {
    const closeToast = jest.fn()
    showAudioGenerationStartedToast({ tuneName: 'Copper Kettle' })
    expect(toast.info).toHaveBeenCalledTimes(1)
    const renderFn = toast.info.mock.calls[0][0]
    const rendered = renderFn({ closeToast: closeToast })
    const button = rendered.props.children.find(function(child) {
      return child && child.type === 'button'
    })
    expect(button.props.children).toBe('View jobs')
    button.props.onClick()
    expect(closeToast).toHaveBeenCalled()
    expect(window.location.assign).toHaveBeenCalledWith(backgroundJobsAudioGenerationPath())
  })

  test('showAudioGenerationCompleteToast renders Open tune button', function() {
    const closeToast = jest.fn()
    showAudioGenerationCompleteToast({ tuneName: 'Copper Kettle', tuneId: 'tune-1' })
    expect(toast.success).toHaveBeenCalledTimes(1)
    const renderFn = toast.success.mock.calls[0][0]
    const rendered = renderFn({ closeToast: closeToast })
    const button = rendered.props.children.find(function(child) {
      return child && child.type === 'button'
    })
    expect(button.props.children).toBe('Open tune')
    button.props.onClick()
    expect(closeToast).toHaveBeenCalled()
    expect(window.location.assign).toHaveBeenCalledWith('/tunes/tune-1')
  })
})
