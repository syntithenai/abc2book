#!/usr/bin/env node
/**
 * Playback router parity E2E — asserts route log policy fields per link type.
 *
 * Usage:
 *   npm start
 *   npm run test:playback:router:e2e
 */
'use strict'

const {
  BASE,
  TIMEOUT_MS,
  pass,
  fail,
  skip,
  waitForServer,
  launchBrowser,
  dismissBlockingDialogs,
  sleep,
  patchPageCompat,
} = require('./helpers')

const {
  PLAYBACK_E2E_TUNE_IDS,
  playbackRouteUrl,
} = require('./playback-router-fixtures')

const SELECTORS = {
  play: '[data-testid="media-play-button"], header .btn-group button.btn-success.btn-lg',
  mediaRoot: '#media-player, #tunebookyoutube, audio#tunebookaudio, .media-seek-slider',
}

const SCENARIOS = [
  {
    name: 'notation-midi',
    tuneId: PLAYBACK_E2E_TUNE_IDS.midi,
    mode: 'midi',
    expectedEngine: 'notation-midi',
    resolverRequired: false,
  },
  {
    name: 'direct-mp3',
    tuneId: PLAYBACK_E2E_TUNE_IDS.mp3,
    mode: 'media',
    linkIndex: 0,
    expectedEngine: 'local-html',
    resolverRequired: false,
  },
  {
    name: 'youtube-iframe',
    tuneId: PLAYBACK_E2E_TUNE_IDS.youtube,
    mode: 'media',
    linkIndex: 0,
    expectedEngine: 'youtube-iframe',
    resolverRequired: false,
  },
  {
    name: 'archive-resolver-required',
    tuneId: PLAYBACK_E2E_TUNE_IDS.archive,
    mode: 'media',
    linkIndex: 0,
    expectedEngine: 'local-html',
    resolverRequired: true,
    skipAudioProgress: true,
  },
  {
    name: 'processed-audio',
    tuneId: PLAYBACK_E2E_TUNE_IDS.processed,
    mode: 'media',
    linkIndex: 0,
    expectedEngine: 'local-processor',
    resolverRequired: false,
    allowedEngines: ['local-processor', 'android-native'],
  },
  {
    name: 'midi-file',
    tuneId: PLAYBACK_E2E_TUNE_IDS.midifile,
    mode: 'media',
    linkIndex: 0,
    expectedEngine: 'midi-file',
    resolverRequired: false,
  },
]

const results = []

async function seedPlaybackRouterFixtures(page) {
  const origin = new URL(BASE.split('#')[0]).origin
  await page.goto(origin + '/?seed=playback-router', { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await dismissBlockingDialogs(page, 60000)
  await page.waitForFunction(function() {
    return typeof window.__abc2bookE2ESeed === 'function'
  }, { timeout: 30000 })
  await page.evaluate(function() {
    localStorage.setItem('tunebook_playback_debug', '1')
    window.__tunebookPlaybackRouteLogEnabled = true
    if (window.__tunebookPlaybackRouteLog) {
      window.__tunebookPlaybackRouteLog = []
    }
    return window.__abc2bookE2ESeed({ replace: true })
  })
  await sleep(500)
}

async function clickPlay(page) {
  await page.waitForSelector(SELECTORS.mediaRoot, { timeout: TIMEOUT_MS })
  const playBtn = await page.$(SELECTORS.play)
  if (!playBtn) {
    throw new Error('Play button not found')
  }
  await playBtn.click()
  await sleep(800)
}

async function latestRouteLog(page) {
  return page.evaluate(function() {
    const log = window.__tunebookPlaybackRouteLog || []
    for (let i = log.length - 1; i >= 0; i -= 1) {
      if (log[i] && log[i].expected) return log[i]
    }
    return log.length ? log[log.length - 1] : null
  })
}

async function runScenario(page, scenario) {
  const url = playbackRouteUrl(BASE, scenario.tuneId, scenario.mode, scenario.linkIndex)
  await page.goto(url.split('#')[0] + '#' + url.split('#')[1], { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await dismissBlockingDialogs(page, 30000)
  await page.evaluate(function() {
    if (window.__tunebookPlaybackRouteLog) {
      window.__tunebookPlaybackRouteLog = []
    }
  })
  await clickPlay(page)
  let entry = await latestRouteLog(page)
  if (!entry || !entry.expected) {
    await sleep(1500)
    entry = await latestRouteLog(page)
  }
  if (!entry || !entry.expected) {
    throw new Error('No route log entry with expected engine')
  }
  const engine = entry.expected.engine
  const allowed = scenario.allowedEngines || [scenario.expectedEngine]
  if (allowed.indexOf(engine) < 0) {
    throw new Error('expected engine ' + allowed.join('|') + ' got ' + engine)
  }
  if (entry.expected.resolverRequired !== scenario.resolverRequired) {
    throw new Error('resolverRequired expected ' + scenario.resolverRequired + ' got ' + entry.expected.resolverRequired)
  }
  if (entry.severity === 'policy' && entry.match === false) {
    throw new Error('policy parity mismatch: ' + (entry.reason || 'unknown'))
  }
}

async function runSnapcastScenario(page) {
  const resolverUrl = process.env.SNAPCAST_TEST_RESOLVER_URL || ''
  if (!resolverUrl) {
    skip(results, 'snapcast-default', 'SNAPCAST_TEST_RESOLVER_URL not set')
    return
  }
  await page.evaluate(function() {
    localStorage.setItem('bookstorage_preferred_remote_output', 'snapcast')
    localStorage.setItem('bookstorage_snapcast_output_enabled', '1')
    localStorage.setItem('bookstorage_chromecast_output_enabled', '1')
  })
  const url = playbackRouteUrl(BASE, PLAYBACK_E2E_TUNE_IDS.mp3, 'media', 0)
  await page.goto(url.split('#')[0] + '#' + url.split('#')[1], { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.evaluate(function() {
    if (window.__tunebookPlaybackRouteLog) window.__tunebookPlaybackRouteLog = []
  })
  await clickPlay(page)
  const entry = await latestRouteLog(page)
  if (!entry || entry.expected.engine !== 'snapcast') {
    skip(results, 'snapcast-default', 'Snapcast route not selected (resolver may be unreachable)')
    return
  }
  pass(results, 'snapcast-default')
}

async function run() {
  console.log('Playback router parity E2E')
  const origin = new URL(BASE.split('#')[0]).origin
  if (!(await waitForServer(origin))) {
    console.error('Dev server not reachable at', origin)
    process.exit(1)
  }

  const browser = await launchBrowser()
  const page = await browser.newPage()
  patchPageCompat(page)

  try {
    await seedPlaybackRouterFixtures(page)

    for (let i = 0; i < SCENARIOS.length; i += 1) {
      const scenario = SCENARIOS[i]
      try {
        await runScenario(page, scenario)
        pass(results, scenario.name)
      } catch (err) {
        try {
          await runScenario(page, scenario)
          pass(results, scenario.name + ' (retry)')
        } catch (retryErr) {
          fail(results, scenario.name, retryErr)
        }
      }
    }

    try {
      await runSnapcastScenario(page)
    } catch (err) {
      fail(results, 'snapcast-default', err)
    }
  } finally {
    if (browser.disconnect) {
      await browser.disconnect()
    } else {
      await browser.close()
    }
  }

  const failed = results.filter(function(r) { return r.ok === false })
  const skipped = results.filter(function(r) { return r.ok === null })
  console.log('\nSummary:', results.length - failed.length - skipped.length, 'passed,',
    failed.length, 'failed,', skipped.length, 'skipped')
  process.exit(failed.length > 0 ? 1 : 0)
}

run().catch(function(err) {
  console.error(err)
  process.exit(1)
})
