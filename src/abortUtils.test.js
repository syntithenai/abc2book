import { isAbortError } from './abortUtils'

describe('abortUtils', function() {
  test('isAbortError detects AbortError', function() {
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortError(new Error('Search failed'))).toBe(false)
  })
})
