/**
 * @jest-environment jsdom
 */

import { createTokenClientController } from './googleLoginTokenClient'

describe('googleLoginTokenClient offline', function() {
  const originalOnLine = navigator.onLine

  afterEach(function() {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    })
    delete window.google
  })

  test('refresh does not request a GIS token while offline', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const requestAccessToken = jest.fn()
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: jest.fn(function() {
            return { requestAccessToken: requestAccessToken }
          }),
        },
      },
    }
    localStorage.setItem('google_login_user', '1')
    const controller = createTokenClientController({
      clientId: 'client',
      scopes: ['openid'],
      getAccessToken: function() { return null },
      setAccessToken: jest.fn(),
      setUser: jest.fn(),
      onTokenUpdated: jest.fn(),
    })
    controller.refresh()
    expect(window.google.accounts.oauth2.initTokenClient).not.toHaveBeenCalled()
    expect(requestAccessToken).not.toHaveBeenCalled()
    try { localStorage.removeItem('google_login_user') } catch (e) {}
  })
})
