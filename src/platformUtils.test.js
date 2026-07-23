import { isChromiumDesktopBrowser } from './platformUtils'

jest.mock('react-device-detect', function() {
  return { isMobile: false }
})

describe('isChromiumDesktopBrowser', function() {
  const originalNavigator = global.navigator

  afterEach(function() {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  })

  test('detects desktop Chrome', function() {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    expect(isChromiumDesktopBrowser()).toBe(true)
  })

  test('rejects Edge', function() {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      },
    })
    expect(isChromiumDesktopBrowser()).toBe(false)
  })
})
