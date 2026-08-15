import {
  OFFLINE_MESSAGE,
  OFFLINE_LOGIN_MESSAGE,
  __resetOfflineNetworkForTests,
  getOfflineBlock,
  isNavigatorOffline,
  networkUnavailableMessage,
  registerOnlineResume,
  shouldAttemptNetwork,
} from './offlineNetwork'

describe('offlineNetwork', function() {
  const originalOnLine = navigator.onLine

  afterEach(function() {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    })
  })

  test('isNavigatorOffline and shouldAttemptNetwork follow navigator.onLine', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(isNavigatorOffline()).toBe(true)
    expect(shouldAttemptNetwork()).toBe(false)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    expect(isNavigatorOffline()).toBe(false)
    expect(shouldAttemptNetwork()).toBe(true)
  })

  test('getOfflineBlock is null when online', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    expect(getOfflineBlock()).toBeNull()
  })

  test('getOfflineBlock has no login button when offline', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const block = getOfflineBlock()
    expect(block).toEqual({
      kind: 'offline',
      message: OFFLINE_MESSAGE,
      showLoginButton: false,
    })
  })

  test('networkUnavailableMessage prefers offline copy over resolver fallback', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(networkUnavailableMessage('start the local resolver')).toBe(OFFLINE_MESSAGE)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    expect(networkUnavailableMessage('start the local resolver')).toBe('start the local resolver')
    expect(networkUnavailableMessage()).toBe('Media resolver is not available.')
  })

  test('offline login message is distinct from generic network copy', function() {
    expect(OFFLINE_LOGIN_MESSAGE).toMatch(/sign-in/i)
    expect(OFFLINE_LOGIN_MESSAGE).not.toBe(OFFLINE_MESSAGE)
  })

  test('registerOnlineResume runs callbacks when the browser comes online', function() {
    __resetOfflineNetworkForTests()
    const resume = jest.fn()
    registerOnlineResume(resume)
    window.dispatchEvent(new Event('online'))
    expect(resume).toHaveBeenCalledTimes(1)
    __resetOfflineNetworkForTests()
  })
})
