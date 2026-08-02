import { FEED_FEEDBACK_ADMIN_EMAIL } from './feedFeedbackUtils'
import { isMusicGenerationAdmin } from './musicGenerationAdmin'

describe('musicGenerationAdmin', function() {
  test('allows only the configured admin email', function() {
    expect(isMusicGenerationAdmin({ email: FEED_FEEDBACK_ADMIN_EMAIL })).toBe(true)
    expect(isMusicGenerationAdmin({ email: 'other@example.com' })).toBe(false)
    expect(isMusicGenerationAdmin(null)).toBe(false)
  })
})
