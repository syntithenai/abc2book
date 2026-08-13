import { FEED_FEEDBACK_ADMIN_EMAIL } from './feedFeedbackUtils'
import { readLoginHintEmail, readStoredLoginProfile } from './googleLoginTokenClient'

function readLegacyLoginEmail() {
  try {
    const raw = localStorage.getItem('google_login_user') || ''
    if (raw && raw.includes('@')) return { email: raw }
  } catch (e) {}
  return null
}

function readHintLoginEmail() {
  try {
    const hint = readLoginHintEmail()
    if (hint && hint.includes('@')) return { email: hint }
  } catch (e) {}
  return null
}

function resolverReportsAdminAccess(resolverStatus) {
  if (!resolverStatus) return false
  if (resolverStatus.adminAccess === true) return true
  const candidates = resolverStatus.candidates || []
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    if (candidate && candidate.reachable && candidate.adminAccess === true) return true
  }
  return false
}

export function resolveMusicGenerationUser(user) {
  if (user && user.email) return user
  return readStoredLoginProfile() || readLegacyLoginEmail() || readHintLoginEmail()
}

export function isMusicGenerationAdmin(user, resolverStatus) {
  const resolved = resolveMusicGenerationUser(user)
  if (resolved && resolved.email === FEED_FEEDBACK_ADMIN_EMAIL) return true
  // After login, /health reports adminAccess for ALLOWED_ADMIN_EMAILS even when
  // the SPA user profile has not loaded yet.
  return resolverReportsAdminAccess(resolverStatus)
}
