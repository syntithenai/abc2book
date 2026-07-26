import { retidyBulkLine } from './bulkTextTidy'

describe('bulkTextTidy', function() {
  test('retidyBulkLine splits Clifftop YouTube title before link', function() {
    const line = 'Clifftop 2025 - Rattlesnake - Judy Hyman & Frank Evans | https://youtu.be/abc'
    expect(retidyBulkLine(line)).toBe(
      'Rattlesnake by Judy Hyman & Frank Evans | https://youtu.be/abc'
    )
  })
})
