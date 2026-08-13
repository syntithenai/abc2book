jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
      warning: jest.fn(),
      dismiss: jest.fn(),
    },
  }
})

import React from 'react'
import { toast } from 'react-toastify'
import { isCloudYoutubeProxyBlocked } from './youtubeUnlock'
import {
  __resetYoutubeProxyLimitationToastForTests,
  maybeNotifyYoutubeProxyLimitation,
  resetYoutubeProxyLimitationNotify,
} from './youtubeProxyLimitationToast'
import { isChromiumDesktopBrowser } from './platformUtils'

jest.mock('./platformUtils', function() {
  const actual = jest.requireActual('./platformUtils')
  return Object.assign({}, actual, {
    isChromiumDesktopBrowser: jest.fn(function() { return false }),
  })
})

const CLOUD_FEATURES = {
  proxy: true,
  lightMode: true,
  youtubeEgressRequired: true,
}

describe('isCloudYoutubeProxyBlocked', function() {
  beforeEach(function() {
    localStorage.clear()
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
  })

  test('true for cloud resolver without webshare or extension', function() {
    expect(isCloudYoutubeProxyBlocked(CLOUD_FEATURES)).toBe(true)
  })

  test('false for home resolver', function() {
    expect(isCloudYoutubeProxyBlocked({ proxy: true, lightMode: false, youtubeEgressRequired: false })).toBe(false)
  })

  test('false when explicit youtubeAudio feature', function() {
    expect(isCloudYoutubeProxyBlocked(Object.assign({}, CLOUD_FEATURES, { youtubeAudio: true }))).toBe(false)
  })
})

describe('maybeNotifyYoutubeProxyLimitation', function() {
  beforeEach(function() {
    localStorage.clear()
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
    __resetYoutubeProxyLimitationToastForTests()
    isChromiumDesktopBrowser.mockReturnValue(false)
    toast.info.mockClear()
    toast.warning.mockClear()
  })

  test('warns when shared resolver needs login for youtube pitch', function() {
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 2, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: { proxy: true, youtubeAudio: true },
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
      accessToken: null,
      tuneId: 't1',
      linkIndex: 0,
      activated: true,
      externalPitchUnavailable: true,
    })
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(String(toast.warning.mock.calls[0][0])).toMatch(/YouTube pitch shift/i)
    expect(String(toast.warning.mock.calls[0][0])).toMatch(/Login to continue/i)
  })

  test('warns on non-chrome when pitch shift needs cloud youtube proxy', function() {
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 2, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
      activated: true,
      externalPitchUnavailable: true,
    })
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(String(toast.warning.mock.calls[0][0])).toMatch(/cloud media resolver/i)
    expect(toast.info).not.toHaveBeenCalled()
  })

  test('shows install toast on chrome desktop', function() {
    isChromiumDesktopBrowser.mockReturnValue(true)
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 1, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
      activated: true,
      externalPitchUnavailable: true,
    })
    expect(toast.info).toHaveBeenCalledTimes(1)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  test('dedupes per tune and link', function() {
    const payload = {
      settings: { pitch: 2, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
      activated: true,
      externalPitchUnavailable: true,
    }
    maybeNotifyYoutubeProxyLimitation(payload)
    maybeNotifyYoutubeProxyLimitation(payload)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    resetYoutubeProxyLimitationNotify()
    maybeNotifyYoutubeProxyLimitation(payload)
    expect(toast.warning).toHaveBeenCalledTimes(2)
  })

  test('skips when external pitch path is already available', function() {
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 2, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
      activated: true,
      externalPitchUnavailable: false,
    })
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  test('skips until user activates pitch shift', function() {
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 2, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
      activated: false,
      externalPitchUnavailable: true,
    })
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  test('skips for non-youtube media', function() {
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 2, fineTune: 0, audioFilters: null },
      srcType: 'audio',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
    })
    expect(toast.warning).not.toHaveBeenCalled()
  })

  test('install toast button opens helper instructions', function() {
    isChromiumDesktopBrowser.mockReturnValue(true)
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent')
    maybeNotifyYoutubeProxyLimitation({
      settings: { pitch: 1, fineTune: 0, audioFilters: null },
      srcType: 'youtube',
      resolverFeatures: CLOUD_FEATURES,
      tuneId: 't1',
      linkIndex: 0,
      activated: true,
      externalPitchUnavailable: true,
    })
    const renderFn = toast.info.mock.calls[0][0]
    const rendered = renderFn({ closeToast: jest.fn() })
    const button = rendered.props.children.find(function(child) {
      return child && child.props && child.props['data-testid'] === 'youtube-helper-install-toast'
    })
    expect(button).toBeTruthy()
    button.props.onClick()
    expect(dispatchSpy).toHaveBeenCalled()
    dispatchSpy.mockRestore()
  })
})
