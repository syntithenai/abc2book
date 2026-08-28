/**
 * abcjs caches each instrument/note load promise in a module-level object.
 * Rejected loads (network blip, aborted XHR, hanging proxy) stay cached forever,
 * so placeNote silently skips that pitch for the rest of the session.
 */

function getSoundsCache() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('abcjs/src/synth/sounds-cache')
  } catch (err) {
    return null
  }
}

/** Remove every cached instrument note (success and failure). */
export function clearAbcjsSoundsCache() {
  const cache = getSoundsCache()
  if (!cache || typeof cache !== 'object') return 0
  let removed = 0
  Object.keys(cache).forEach(function(instrument) {
    delete cache[instrument]
    removed += 1
  })
  return removed
}

/**
 * Drop only failed note loads so the next CreateSynth.init can retry them.
 * In-flight and successful loads are kept.
 * @returns {Promise<number>}
 */
export function clearRejectedAbcjsSoundsCache() {
  const cache = getSoundsCache()
  if (!cache || typeof cache !== 'object') return Promise.resolve(0)

  const settled = []
  Object.keys(cache).forEach(function(instrument) {
    const instrumentCache = cache[instrument]
    if (!instrumentCache || typeof instrumentCache !== 'object') return
    Object.keys(instrumentCache).forEach(function(noteName) {
      const entry = instrumentCache[noteName]
      if (!entry || typeof entry.then !== 'function') return
      const flag = { status: 'pending' }
      entry.then(
        function() { flag.status = 'fulfilled' },
        function() { flag.status = 'rejected' }
      )
      settled.push({ instrument: instrument, noteName: noteName, flag: flag })
    })
  })

  if (!settled.length) return Promise.resolve(0)

  // Flush microtasks so already-settled promises update their flags.
  return Promise.resolve().then(function() {
    return Promise.resolve()
  }).then(function() {
    let removed = 0
    settled.forEach(function(item) {
      if (item.flag.status !== 'rejected') return
      const instrumentCache = cache[item.instrument]
      if (!instrumentCache || !instrumentCache[item.noteName]) return
      delete instrumentCache[item.noteName]
      removed += 1
      if (Object.keys(instrumentCache).length === 0) {
        delete cache[item.instrument]
      }
    })
    return removed
  })
}
