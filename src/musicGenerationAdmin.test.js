import { FEED_FEEDBACK_ADMIN_EMAIL } from './feedFeedbackUtils'
import { isMusicGenerationAdmin, resolveMusicGenerationUser } from './musicGenerationAdmin'

describe('musicGenerationAdmin', function() {
  afterEach(function() {
    try { localStorage.removeItem('google_login_user') } catch (e) {}
    try { localStorage.removeItem('google_login_profile') } catch (e) {}
    try { localStorage.removeItem('google_login_hint_email') } catch (e) {}
  })

  test('allows only the configured admin email', function() {
    expect(isMusicGenerationAdmin({ email: FEED_FEEDBACK_ADMIN_EMAIL })).toBe(true)
    expect(isMusicGenerationAdmin({ email: 'other@example.com' })).toBe(false)
    expect(isMusicGenerationAdmin(null)).toBe(false)
  })

  test('falls back to stored profile and login hint when user prop is missing', function() {
    localStorage.setItem('google_login_user', '1')
    localStorage.setItem('google_login_hint_email', FEED_FEEDBACK_ADMIN_EMAIL)
    expect(resolveMusicGenerationUser(null)).toEqual({ email: FEED_FEEDBACK_ADMIN_EMAIL })
    expect(isMusicGenerationAdmin(null)).toBe(true)

    localStorage.setItem('google_login_profile', JSON.stringify({ email: 'other@example.com' }))
    expect(isMusicGenerationAdmin(null)).toBe(false)
  })

  test('treats resolver adminAccess as admin even without a local user profile', function() {
    expect(isMusicGenerationAdmin(null, {
      available: true,
      adminAccess: true,
    })).toBe(true)
    expect(isMusicGenerationAdmin({ email: 'other@example.com' }, {
      available: true,
      adminAccess: true,
    })).toBe(true)
    expect(isMusicGenerationAdmin(null, {
      available: false,
      candidates: [{
        reachable: true,
        adminAccess: true,
      }],
    })).toBe(true)
    expect(isMusicGenerationAdmin(null, {
      available: false,
      adminAccess: false,
      candidates: [{ reachable: true, adminAccess: false }],
    })).toBe(false)
  })
})
