import {
  DEFAULT_BILLING_MEDIA_PROXY,
  DEFAULT_CLOUD_LIGHT_MEDIA_PROXY,
  DEFAULT_PUBLIC_MEDIA_PROXY,
  getBillingMediaProxyCandidates,
  getMediaProxyBaseCandidates,
  getUseCloudResolver,
  isDevServerMediaProxyBase,
  normalizeMediaProxyBase,
  prefersPublicMediaProxyFirst,
  setUseCloudResolver,
} from './mediaProxyConfig'

describe('mediaProxyConfig', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('normalizeMediaProxyBase trims and validates URLs', function() {
    expect(normalizeMediaProxyBase('')).toBe('')
    expect(normalizeMediaProxyBase('  https://example.com/  ')).toBe('https://example.com')
    expect(normalizeMediaProxyBase('ftp://example.com')).toBe('')
  })

  test('isDevServerMediaProxyBase detects npm start and Vite dev hosts', function() {
    expect(isDevServerMediaProxyBase('http://localhost:3000')).toBe(true)
    expect(isDevServerMediaProxyBase('http://localhost:5173')).toBe(true)
    expect(isDevServerMediaProxyBase('http://localhost:8787')).toBe(false)
    expect(isDevServerMediaProxyBase('https://peppertrees.example.com')).toBe(false)
  })

  test('orders saved settings before localhost and public defaults', function() {
    localStorage.setItem('bookstorage_media_proxy_base', 'https://my-proxy.example.com')
    const candidates = getMediaProxyBaseCandidates()
    expect(candidates[0]).toBe('https://my-proxy.example.com')
    expect(candidates).toContain(DEFAULT_PUBLIC_MEDIA_PROXY)
    expect(candidates).toContain('http://localhost:8787')
    expect(candidates.indexOf('http://localhost:8787')).toBeLessThan(
      candidates.indexOf(DEFAULT_PUBLIC_MEDIA_PROXY)
    )
  })

  test('saved override ranks before dev-server proxy when both exist', function() {
    const originalEnv = process.env.NODE_ENV
    const originalLocation = window.location
    process.env.NODE_ENV = 'development'
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'http:', origin: 'http://localhost:3000', hostname: 'localhost' },
    })
    localStorage.setItem('bookstorage_media_proxy_base', DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
    const candidates = getMediaProxyBaseCandidates()
    expect(candidates[0]).toBe(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
    expect(candidates[1]).toBe('http://localhost:3000')
    process.env.NODE_ENV = originalEnv
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  test('uses localhost then public in non-production desktop builds', function() {
    if (prefersPublicMediaProxyFirst()) return
    const candidates = getMediaProxyBaseCandidates()
    expect(candidates[0]).toBe('http://localhost:8787')
    expect(candidates).toContain(DEFAULT_PUBLIC_MEDIA_PROXY)
    expect(candidates).toContain(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
    expect(candidates.indexOf('http://localhost:8787')).toBeLessThan(
      candidates.indexOf(DEFAULT_PUBLIC_MEDIA_PROXY)
    )
    expect(candidates.indexOf(DEFAULT_PUBLIC_MEDIA_PROXY)).toBeLessThan(
      candidates.indexOf(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
    )
  })

  test('prefers peppertrees then cloud in production builds', function() {
    const originalEnv = process.env.NODE_ENV
    const originalCapacitor = window.Capacitor
    delete window.Capacitor
    process.env.NODE_ENV = 'production'
    try {
      const candidates = getMediaProxyBaseCandidates()
      expect(candidates[0]).toBe(DEFAULT_PUBLIC_MEDIA_PROXY)
      expect(candidates[1]).toBe(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
      expect(candidates).not.toContain('http://localhost:8787')
    } finally {
      process.env.NODE_ENV = originalEnv
      if (originalCapacitor) window.Capacitor = originalCapacitor
    }
  })

  test('native app prefers peppertrees then cloud and skips loopback', function() {
    const originalCapacitor = window.Capacitor
    window.Capacitor = {
      isNativePlatform: function() { return true },
      getPlatform: function() { return 'android' },
    }
    try {
      const candidates = getMediaProxyBaseCandidates()
      expect(candidates[0]).toBe(DEFAULT_PUBLIC_MEDIA_PROXY)
      expect(candidates[1]).toBe(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
      expect(candidates).not.toContain('https://localhost')
      expect(candidates).not.toContain('http://localhost:8787')
    } finally {
      if (originalCapacitor) window.Capacitor = originalCapacitor
      else delete window.Capacitor
    }
  })

  test('billing candidates target Cloud Run not peppertrees', function() {
    expect(getBillingMediaProxyCandidates()).toEqual([DEFAULT_BILLING_MEDIA_PROXY])
    expect(DEFAULT_BILLING_MEDIA_PROXY).toBe(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
    expect(DEFAULT_BILLING_MEDIA_PROXY).not.toBe(DEFAULT_PUBLIC_MEDIA_PROXY)
  })

  test('skips public cloud candidates when cloud resolver disabled', function() {
    setUseCloudResolver(false)
    expect(getUseCloudResolver()).toBe(false)
    const candidates = getMediaProxyBaseCandidates()
    expect(candidates).not.toContain(DEFAULT_PUBLIC_MEDIA_PROXY)
    expect(candidates).not.toContain(DEFAULT_CLOUD_LIGHT_MEDIA_PROXY)
  })
})
