import { linkCanOpenInScratchpad } from './scratchpadFromLink'

describe('scratchpadFromLink', function() {
  test('linkCanOpenInScratchpad allows audio and recording links', function() {
    expect(linkCanOpenInScratchpad({ link: 'https://example.com/a.mp3' }, function() { return false })).toBe(true)
    expect(linkCanOpenInScratchpad({ link: 'abcbook-recording:rec1' }, function() { return false })).toBe(true)
    expect(linkCanOpenInScratchpad({ link: 'https://youtube.com/watch?v=abc' }, function(url) {
      return url && url.indexOf('youtube') !== -1
    })).toBe(false)
  })
})
