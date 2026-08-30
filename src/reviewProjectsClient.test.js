/**
 * Unit tests for reviewProjectsClient helpers.
 */
import { reviewProjectsAvailableFromStatus } from './reviewProjectsClient'

describe('reviewProjectsClient', function() {
  test('reviewProjectsAvailableFromStatus requires available + flag', function() {
    expect(reviewProjectsAvailableFromStatus(null)).toBe(false)
    expect(reviewProjectsAvailableFromStatus({ available: true })).toBe(false)
    expect(reviewProjectsAvailableFromStatus({ available: true, reviewProjects: true })).toBe(true)
    expect(reviewProjectsAvailableFromStatus({
      available: false,
      candidates: [{ reachable: true, available: true, reviewProjects: true }],
    })).toBe(false)
    expect(reviewProjectsAvailableFromStatus({
      available: true,
      reviewProjects: false,
      candidates: [{ reachable: true, available: true, reviewProjects: true }],
    })).toBe(true)
  })
})
