import {
  createDetachedNoOpPlayer,
  isMissingPlayerTarget,
} from './youtubePlayerSafeFactory'

describe('youtubePlayerSafeFactory', function() {
  test('treats null and undefined as missing player targets', function() {
    expect(isMissingPlayerTarget(null)).toBe(true)
    expect(isMissingPlayerTarget(undefined)).toBe(true)
    expect(isMissingPlayerTarget({})).toBe(false)
  })

  test('detached no-op player exposes playVideo without throwing', async function() {
    const player = createDetachedNoOpPlayer()
    expect(typeof player.playVideo).toBe('function')
    await expect(player.playVideo()).resolves.toBeNull()
    await expect(player.destroy()).resolves.toBeUndefined()
  })

  test('factory returns no-op when target is null', function() {
    const factory = require('./youtubePlayerSafeFactory')
    const player = factory(null, {})
    expect(typeof player.playVideo).toBe('function')
    expect(typeof player.on).toBe('function')
  })
})
