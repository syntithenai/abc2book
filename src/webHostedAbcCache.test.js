import { createWebHostedAbcCache } from './webHostedAbcCache'

function fakeUrlApi() {
  let n = 0
  const revoked = []
  return {
    revoked: revoked,
    create: function() { n += 1; return 'blob:test/' + n },
    revoke: function(url) { revoked.push(url) },
  }
}

function blobOf(size) {
  return { size: size }
}

describe('webHostedAbcCache', () => {
  test('put and get round-trip with meta', () => {
    const urlApi = fakeUrlApi()
    const cache = createWebHostedAbcCache({ urlApi })
    const url = cache.put('a', blobOf(10), 30, { durationSec: 30 })
    expect(url).toBe('blob:test/1')
    expect(cache.get('a')).toBe(url)
    expect(cache.getEntry('a').meta).toEqual({ durationSec: 30 })
    expect(cache.has('a')).toBe(true)
    expect(cache.bytes()).toBe(10)
  })

  test('drops entries shorter than the expected duration', () => {
    const urlApi = fakeUrlApi()
    const cache = createWebHostedAbcCache({ urlApi })
    const url = cache.put('a', blobOf(10), 10, null)
    expect(cache.get('a', 40)).toBeNull()
    expect(cache.has('a')).toBe(false)
    expect(urlApi.revoked).toEqual([url])
  })

  test('replacing a key revokes the old url', () => {
    const urlApi = fakeUrlApi()
    const cache = createWebHostedAbcCache({ urlApi })
    const first = cache.put('a', blobOf(10), 30)
    const second = cache.put('a', blobOf(20), 30)
    expect(urlApi.revoked).toEqual([first])
    expect(cache.get('a')).toBe(second)
    expect(cache.bytes()).toBe(20)
    expect(cache.size()).toBe(1)
  })

  test('evicts least recently used but keeps the two most recent', () => {
    const urlApi = fakeUrlApi()
    const cache = createWebHostedAbcCache({ urlApi, maxBytes: 25 })
    cache.put('a', blobOf(10), 30)
    cache.put('b', blobOf(10), 30)
    cache.get('a')
    cache.put('c', blobOf(10), 30)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('c')).toBe(true)

    cache.put('d', blobOf(100), 30)
    expect(cache.has('c')).toBe(true)
    expect(cache.has('d')).toBe(true)
    expect(cache.size()).toBe(2)
  })

  test('clear revokes everything', () => {
    const urlApi = fakeUrlApi()
    const cache = createWebHostedAbcCache({ urlApi })
    cache.put('a', blobOf(1), 1)
    cache.put('b', blobOf(1), 1)
    cache.clear()
    expect(cache.size()).toBe(0)
    expect(cache.bytes()).toBe(0)
    expect(urlApi.revoked).toHaveLength(2)
  })
})
