// Development / test helper to prepopulate the app with a known tunebook.
//
// Seeding runs sample ABC through the app's real import parser and then
// persists + indexes it using the same steps the merge pipeline uses, so the
// running app (and browser automation / manual repro) has realistic data to
// exercise features like books-page playback.
//
// Usage in the browser console (dev builds only):
//   await window.seedTunebook()          // add the sample tunebook
//   await window.seedTunebook({ preset: '10k' })  // perf testing stubs
//   await window.seedTunebook({ replace: true, preset: '1k' })
//   window.clearTunebook()               // remove the sample tunes again
// Or load the app with ?seed=demo to auto-seed when empty,
// or ?seed=notation-basic for notation E2E fixtures,
// or ?seed=playback-router for playback router E2E fixtures.

import { SAMPLE_TUNEBOOK_ABC, SAMPLE_TUNE_IDS } from './sampleTunebookAbc'
import { NOTATION_E2E_FULL_ABC } from './notationE2eFixtures'
import { PLAYBACK_E2E_FULL_ABC } from './playbackRouterE2eFixtures'

const STUB_PRESETS = {
  '1k': 1000,
  '10k': 10000,
  '50k': 50000,
  '100k': 100000,
}

function generateStubTune(tunebook, index, bookName) {
  const id = 'stub-' + String(index).padStart(6, '0')
  const name = 'Stub Tune ' + index
  const tune = tunebook.createTune ? tunebook.createTune({
    id: id,
    name: name,
    books: bookName ? [bookName] : ['Perf Test'],
    tags: index % 3 === 0 ? ['reel'] : ['jig'],
    voices: { V: { notes: ['|:CDEF GABc|'] } },
    lastUpdated: Date.now(),
  }, true) : {
    id: id,
    name: name,
    books: bookName ? [bookName] : ['Perf Test'],
    tags: index % 3 === 0 ? ['reel'] : ['jig'],
    voices: { V: { notes: ['|:CDEF GABc|'] } },
    lastUpdated: Date.now(),
  }
  return tune
}

function generateStubTunes(tunebook, count, bookName) {
  const out = {}
  for (let i = 0; i < count; i += 1) {
    const tune = generateStubTune(tunebook, i + 1, bookName)
    if (tune && tune.id) out[tune.id] = tune
  }
  return out
}

function reindexAndRefresh(tunebook, tunesObj) {
  if (tunebook.buildTunesHash) tunebook.buildTunesHash(tunesObj)
  const indexes = tunebook.indexes
  if (indexes) {
    if (indexes.resetBookIndex) indexes.resetBookIndex()
    if (indexes.resetTagIndex) indexes.resetTagIndex()
    if (indexes.resetGenreIndex) indexes.resetGenreIndex()
    if (indexes.resetArtistIndex) indexes.resetArtistIndex()
    if (indexes.indexTunes) indexes.indexTunes(tunesObj)
  }
  if (tunebook.forceRefresh) tunebook.forceRefresh()
}

/**
 * Parse the sample ABC and merge it into the current tunes.
 * @param {object} tunebook - the useTuneBook return value
 * @param {object} existingTunes - current tunes hash (id -> tune)
 * @param {{ abc?: string, replace?: boolean }} [options]
 * @returns {object|null} the resulting tunes hash, or null if it could not run
 */
export function seedSampleTunebook(tunebook, existingTunes, options) {
  const opts = options || {}
  if (opts.preset && STUB_PRESETS[opts.preset]) {
    const count = STUB_PRESETS[opts.preset]
    const base = opts.replace ? {} : Object.assign({}, existingTunes || {})
    const merged = Object.assign(base, generateStubTunes(tunebook, count, opts.book || 'Perf Test'))
    if (tunebook.setTunes) tunebook.setTunes(merged)
    reindexAndRefresh(tunebook, merged)
    return merged
  }
  if (!tunebook || !tunebook.abcTools || !tunebook.abcTools.abc2Tunebook) {
    return null
  }
  const parsed = tunebook.abcTools.abc2Tunebook(opts.abc || SAMPLE_TUNEBOOK_ABC)
  const seeded = {}
  parsed.forEach(function(parsedTune) {
    const tune = tunebook.createTune ? tunebook.createTune(parsedTune, true) : parsedTune
    if (tune && tune.id) seeded[tune.id] = tune
  })
  const base = opts.replace ? {} : Object.assign({}, existingTunes || {})
  const merged = Object.assign(base, seeded)
  if (tunebook.setTunes) tunebook.setTunes(merged)
  reindexAndRefresh(tunebook, merged)
  return merged
}

/**
 * Remove the sample tunes (by their stable ids) from the current tunes.
 * @param {object} tunebook
 * @param {object} existingTunes
 * @returns {object|null}
 */
export function clearSampleTunebook(tunebook, existingTunes) {
  if (!tunebook) return null
  const remaining = Object.assign({}, existingTunes || {})
  Object.values(SAMPLE_TUNE_IDS).forEach(function(id) {
    delete remaining[id]
  })
  if (tunebook.setTunes) tunebook.setTunes(remaining)
  reindexAndRefresh(tunebook, remaining)
  return remaining
}

/**
 * Expose seeding helpers on window and auto-seed when ?seed=demo is present and
 * the tunebook is empty. No-op in production builds.
 *
 * @param {{ getTunebook: () => object, getTunes: () => object }} context
 */
export function registerDevTunebookSeeder(context) {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV === 'production') return
  if (!context || typeof context.getTunebook !== 'function') return

  window.seedTunebook = function(options) {
    return seedSampleTunebook(context.getTunebook(), context.getTunes(), options)
  }
  window.clearTunebook = function() {
    return clearSampleTunebook(context.getTunebook(), context.getTunes())
  }
  window.__abc2bookE2ESeed = function(options) {
    return seedSampleTunebook(context.getTunebook(), context.getTunes(), {
      abc: NOTATION_E2E_FULL_ABC,
      replace: options && options.replace,
    })
  }

  const search = window.location.search || ''
  const seedMatch = search.match(/[?&]seed=([^&]+)/)
  const seedMode = seedMatch ? decodeURIComponent(seedMatch[1]) : ''
  if (!window.__abcSeedAutoRan && (seedMode === 'demo' || seedMode === 'notation-basic' || seedMode === 'playback-router' || STUB_PRESETS[seedMode])) {
    window.__abcSeedAutoRan = true
    const tunes = context.getTunes() || {}
    const empty = Object.keys(tunes).length === 0
    if (seedMode === 'notation-basic') {
      seedSampleTunebook(context.getTunebook(), tunes, {
        abc: NOTATION_E2E_FULL_ABC,
        replace: true,
      })
    } else if (seedMode === 'playback-router') {
      seedSampleTunebook(context.getTunebook(), tunes, {
        abc: PLAYBACK_E2E_FULL_ABC,
        replace: true,
      })
    } else if (STUB_PRESETS[seedMode]) {
      seedSampleTunebook(context.getTunebook(), tunes, {
        preset: seedMode,
        replace: true,
      })
    } else if (empty) {
      seedSampleTunebook(context.getTunebook(), tunes, {})
    }
  }
}
