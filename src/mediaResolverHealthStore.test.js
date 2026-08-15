jest.mock('./mediaProxyClient', function() {
  return {
    clearActiveMediaProxyBase: jest.fn(),
    isMediaProxyConfigured: jest.fn(function() { return true }),
    probeMediaResolverCandidates: jest.fn(function() {
      return Promise.resolve({
        available: true,
        candidates: [{ base: 'https://resolver.example', reachable: true, available: true }],
      })
    }),
  }
})

import { isMediaProxyConfigured, probeMediaResolverCandidates } from './mediaProxyClient'
import {
  __resetMediaResolverHealthForTests,
  probeMediaResolverHealth,
} from './mediaResolverHealthStore'

describe('mediaResolverHealthStore', function() {
  const originalOnLine = navigator.onLine

  beforeEach(function() {
    __resetMediaResolverHealthForTests()
    probeMediaResolverCandidates.mockClear()
    isMediaProxyConfigured.mockReturnValue(true)
  })

  afterEach(function() {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    })
  })

  test('does not probe /health while offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const available = await probeMediaResolverHealth(null, { force: true })
    expect(available).toBe(false)
    expect(probeMediaResolverCandidates).not.toHaveBeenCalled()
  })

  test('probes /health when online', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    await probeMediaResolverHealth(null, { force: true })
    expect(probeMediaResolverCandidates).toHaveBeenCalled()
  })
})
