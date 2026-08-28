import { clearAbcjsSoundsCache, clearRejectedAbcjsSoundsCache } from './abcjsSoundsCache'

describe('abcjsSoundsCache', function() {
  test('clearAbcjsSoundsCache removes instrument buckets', function() {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const cache = require('abcjs/src/synth/sounds-cache')
    cache.__test_instrument = { A4: Promise.resolve('ok') }
    expect(clearAbcjsSoundsCache()).toBeGreaterThan(0)
    expect(cache.__test_instrument).toBeUndefined()
  })

  test('clearRejectedAbcjsSoundsCache removes only rejected note promises', async function() {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const cache = require('abcjs/src/synth/sounds-cache')
    clearAbcjsSoundsCache()
    cache.piano = {
      A4: Promise.resolve({ ok: true }),
      B4: Promise.reject(new Error('fail')),
    }
    // Prevent unhandled rejection noise from the B4 promise.
    cache.piano.B4.catch(function() {})
    const removed = await clearRejectedAbcjsSoundsCache()
    expect(removed).toBe(1)
    expect(cache.piano.A4).toBeTruthy()
    expect(cache.piano.B4).toBeUndefined()
    clearAbcjsSoundsCache()
  })
})
