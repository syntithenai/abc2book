import {
  isYoutubeHelperDisabled,
  setYoutubeHelperDisabled,
} from './youtubeHelperSettings'

describe('youtubeHelperSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('defaults to enabled', function() {
    expect(isYoutubeHelperDisabled()).toBe(false)
  })

  test('persists disabled state', function() {
    setYoutubeHelperDisabled(true)
    expect(isYoutubeHelperDisabled()).toBe(true)
    setYoutubeHelperDisabled(false)
    expect(isYoutubeHelperDisabled()).toBe(false)
  })

  test('dispatches settings changed event', function() {
    const handler = jest.fn()
    window.addEventListener('youtubeHelperSettingsChanged', handler)
    setYoutubeHelperDisabled(true)
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('youtubeHelperSettingsChanged', handler)
  })
})
