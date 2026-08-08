import { isYoutubeDetachedPlayerError } from './youtubePlayerErrors'

describe('isYoutubeDetachedPlayerError', function() {
  test('detects null playVideo errors from youtube-player teardown', function() {
    expect(isYoutubeDetachedPlayerError(
      new TypeError("Cannot read properties of null (reading 'playVideo')")
    )).toBe(true)
  })

  test('detects detached DOM errors', function() {
    expect(isYoutubeDetachedPlayerError(new Error('Player is not attached to the DOM'))).toBe(true)
  })

  test('ignores unrelated errors', function() {
    expect(isYoutubeDetachedPlayerError(new Error('network failed'))).toBe(false)
  })
})
