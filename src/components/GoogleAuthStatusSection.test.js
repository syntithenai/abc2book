/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import GoogleAuthStatusSection from './GoogleAuthStatusSection'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('GoogleAuthStatusSection', function() {
  var container
  var root

  beforeEach(function() {
    localStorage.clear()
    localStorage.setItem('google_login_user', '1')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  test('sign out then log in opens Google on the same click', function() {
    var login = jest.fn()
    var resolveLogout
    var logout = jest.fn(function() {
      return new Promise(function(resolve) { resolveLogout = resolve })
    })

    act(function() {
      root.render(React.createElement(GoogleAuthStatusSection, {
        user: { email: 'user@example.com' },
        token: { access_token: 'tok', expires_at: Date.now() + 3600000 },
        authMode: 'token',
        authBase: 'http://localhost:3000',
        authBaseChecked: true,
        resolverStatus: {
          candidates: [
            { base: 'http://localhost:3000', reachable: true, oauthBff: true },
          ],
        },
        login: login,
        logout: logout,
      }))
    })

    var action = Array.from(container.querySelectorAll('button')).find(function(button) {
      return button.textContent.indexOf('Sign out, then log in again') !== -1
    })
    expect(action).toBeTruthy()

    act(function() {
      action.click()
    })

    expect(logout).toHaveBeenCalled()
    expect(login).toHaveBeenCalled()
    resolveLogout()
  })
})
