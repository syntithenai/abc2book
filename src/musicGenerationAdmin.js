import { FEED_FEEDBACK_ADMIN_EMAIL } from './feedFeedbackUtils'
import { readStoredLoginProfile } from './googleLoginTokenClient'

function readLegacyLoginEmail() {
  try {
    const raw = localStorage.getItem('google_login_user') || ''
    if (raw && raw.includes('@')) return { email: raw }
  } catch (e) {}
  return null
}

export function resolveMusicGenerationUser(user) {
  if (user && user.email) return user
  return readStoredLoginProfile() || readLegacyLoginEmail()
}

export function isMusicGenerationAdmin(user) {
  const resolved = resolveMusicGenerationUser(user)
  return !!(resolved && resolved.email === FEED_FEEDBACK_ADMIN_EMAIL)
}
