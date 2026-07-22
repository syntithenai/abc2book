import {
  DEFAULT_CLOUD_LIGHT_MEDIA_PROXY,
  DEFAULT_PUBLIC_MEDIA_PROXY,
  getMediaProxyBaseCandidates,
  normalizeMediaProxyBase,
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

  test('uses localhost then public when no saved setting', function() {
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
})
