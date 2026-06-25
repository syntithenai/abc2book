#!/usr/bin/env node
/**
 * Browser smoke test for playback: play, progress, seek, pause/resume/seek.
 *
 * Prerequisites:
 *   npm start
 *   Tune data must be available in the browser (IndexedDB). Options:
 *     - Connect to your running Chrome: PLAYBACK_TEST_CDP_URL=http://127.0.0.1:9222
 *     - Or use a Chrome profile: PLAYBACK_TEST_USER_DATA_DIR=/path/to/profile
 *
 * Usage:
 *   npm run test:playback:e2e
 */
'use strict'

const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')

const BASE = process.env.PLAYBACK_TEST_BASE || 'http://localhost:3000'
const TEST_URL = process.env.PLAYBACK_TEST_URL
  || BASE + '/#/tunes/62828a3a7e0d5d8ba323b83c/playMedia/0'
const HEADLESS = process.env.HEADLESS !== '0'
const TIMEOUT_MS = parseInt(process.env.PLAYBACK_TEST_TIMEOUT || '120000', 10)
const CDP_URL = process.env.PLAYBACK_TEST_CDP_URL || ''
const USER_DATA_DIR = process.env.PLAYBACK_TEST_USER_DATA_DIR || ''
const REQUIRE_TUNE = process.env.PLAYBACK_TEST_REQUIRE_TUNE === '1'
const SYNC_ACTION = process.env.PLAYBACK_TEST_SYNC_ACTION || 'merge'

const SELECTORS = {
  play: '[data-testid="media-play-button"], header .btn-group button.btn-success.btn-lg',
  pause: '[data-testid="media-pause-button"], header .btn-group button.btn-warning.btn-lg',
  seekSlider: '[data-testid="media-seek-slider"], .mediaprogressslider',
  seekTime: '[data-testid="media-seek-time"], .media-seek-time',
  tapModal: '[data-testid="tap-to-play-modal"], .modal.show',
  mergeDialog: '[data-testid="merge-warning-dialog"]',
  mergeButton: '[data-testid="merge-warning-merge"]',
  mergeDiscard: '[data-testid="merge-warning-discard"]',
  importDialog: '[data-testid="import-warning-dialog"]',
  importButton: '[data-testid="import-warning-confirm"]',
  mediaRoot: '#media-player, #tunebookyoutube, audio#tunebookaudio, .media-seek-slider',
}

const results = []

function pass(name) {
  results.push({ name: name, ok: true })
  console.log('  ok', name)
}

function fail(name, err) {
  results.push({ name: name, ok: false, error: err.message || String(err) })
  console.error(' FAIL', name)
  console.error('     ', err.message || err)
}

function skip(name, reason) {
  results.push({ name: name, ok: null, skip: reason })
  console.log(' skip', name, '—', reason)
}

async function waitForServer(url) {
  const origin = new URL(url.split('#')[0] || url).origin
  try {
    const res = await fetch(origin, { signal: AbortSignal.timeout(5000) })
    return res.ok || res.status === 404
  } catch (e) {
    return false
  }
}

async function waitForTuneReady(page, timeoutMs) {
  await page.waitForFunction(function(sel) {
    if (document.querySelector(sel)) return true
    const bodyLen = (document.body && document.body.innerText) ? document.body.innerText.trim().length : 0
    return bodyLen > 200
  }, { timeout: timeoutMs }, SELECTORS.mediaRoot)
}

async function query(page, selector) {
  return page.$(selector)
}

async function getSeekTimes(page) {
  return page.evaluate(function(sel) {
    if (window.__abc2bookPlaybackTest && window.__abc2bookPlaybackTest.getProgress) {
      const p = window.__abc2bookPlaybackTest.getProgress()
      return { current: p.currentTime, duration: p.duration }
    }
    const el = document.querySelector(sel)
    if (!el) return null
    const m = el.textContent.trim().match(/([\d.]+)\/([\d.]+)/)
    if (!m) return null
    return { current: parseFloat(m[1]), duration: parseFloat(m[2]) }
  }, SELECTORS.seekTime)
}

async function getPageState(page) {
  return page.evaluate(function(sels) {
    function visible(el) {
      if (!el) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    const mergeTitle = document.querySelector('.modal-title')
    return {
      hash: window.location.hash,
      mergeWarning: visible(document.querySelector(sels.mergeDialog))
        || (mergeTitle && mergeTitle.textContent.indexOf('Update Warning') >= 0),
      importWarning: visible(document.querySelector(sels.importDialog)),
      tapModal: visible(document.querySelector(sels.tapModal)),
      hasPlay: !!document.querySelector(sels.play),
      hasPause: !!document.querySelector(sels.pause),
      hasMedia: !!document.querySelector(sels.mediaRoot),
    }
  }, SELECTORS)
}

async function dismissBlockingDialogs(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await getPageState(page)

    if (state.mergeWarning) {
      let clicked = await page.evaluate(function(preferDiscard) {
        const byTestId = preferDiscard
          ? document.querySelector('[data-testid="merge-warning-discard"]')
          : document.querySelector('[data-testid="merge-warning-merge"]')
        if (byTestId) {
          byTestId.click()
          return byTestId.textContent.trim()
        }
        const buttons = Array.from(document.querySelectorAll('.modal-dialog button'))
        const merge = buttons.find(function(b) { return b.textContent.trim() === 'Merge' })
        const discard = buttons.find(function(b) { return b.textContent.trim() === 'Discard Local Differences' })
        const btn = preferDiscard && discard ? discard : (merge || discard)
        if (btn) {
          btn.click()
          return btn.textContent.trim()
        }
        return null
      }, SYNC_ACTION === 'discard')
      if (clicked) {
        console.log(' Dismissing Google Drive sync dialog (' + clicked + ')...')
        await page.waitForFunction(function() {
          const title = document.querySelector('.modal-title')
          return !(title && title.textContent.indexOf('Update Warning') >= 0)
        }, { timeout: 60000 })
        await page.waitForTimeout(1000)
        continue
      }
    }

    if (state.importWarning) {
      const btn = await page.$(SELECTORS.importButton)
      if (btn) {
        console.log(' Dismissing import warning dialog...')
        await btn.click()
        await page.waitForFunction(function() {
          return !document.querySelector('[data-testid="import-warning-dialog"]')
        }, { timeout: 60000 })
        await page.waitForTimeout(1000)
        continue
      }
    }

    if (!state.mergeWarning && !state.importWarning) {
      return
    }

    await page.waitForTimeout(500)
  }
  throw new Error('blocking sync/import dialog still visible after ' + timeoutMs + 'ms')
}

async function waitForMediaControls(page, timeoutMs) {
  await page.waitForFunction(function(sels) {
    return document.querySelector(sels.play) || document.querySelector(sels.pause)
  }, { timeout: timeoutMs }, SELECTORS)
}

async function clickTapToPlayModal(page) {
  const btn = await page.$('[data-testid="tap-to-play-modal"] .btn-success, .modal.show .btn-success')
  if (!btn) return false
  await btn.click()
  await page.waitForTimeout(800)
  return true
}

async function ensurePlaying(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await getPageState(page)
    if (state.mergeWarning || state.importWarning) {
      await dismissBlockingDialogs(page, 60000)
    }
    await dismissTapToPlayIfNeeded(page)
    if (await isPlaying(page)) return

    const playBtn = await query(page, SELECTORS.play)
    if (playBtn) {
      await playBtn.click()
      await page.waitForTimeout(800)
      continue
    }

    if (await clickTapToPlayModal(page)) continue

    await page.waitForTimeout(300)
  }
  const state = await getPageState(page)
  throw new Error('playback did not start: ' + JSON.stringify(state))
}

async function clickPlay(page) {
  await waitForMediaControls(page, 60000)
  await dismissTapToPlayIfNeeded(page)
  const btn = await page.waitForSelector(SELECTORS.play, { visible: true, timeout: 20000 })
  await btn.click()
}

async function clickPause(page) {
  const btn = await page.waitForSelector(SELECTORS.pause, { visible: true, timeout: 20000 })
  await btn.click()
}

async function ensurePaused(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await isPlaying(page))) return
    const btn = await query(page, SELECTORS.pause)
    if (btn) { try { await btn.click() } catch (e) {} }
    await page.waitForTimeout(500)
  }
  if (await isPlaying(page)) throw new Error('could not pause playback')
}

async function isPlaying(page) {
  return !!(await query(page, SELECTORS.pause))
}

async function isTapToPlayVisible(page) {
  return page.evaluate(function(sel) {
    const modal = document.querySelector(sel)
    if (!modal) return false
    return modal.classList.contains('show')
  }, SELECTORS.tapModal)
}

async function dismissTapToPlayIfNeeded(page) {
  if (!(await isTapToPlayVisible(page))) return false
  const playBtn = await page.$('[data-testid="tap-to-play-modal"] .btn-success, .modal.show .btn-success')
  if (playBtn) {
    await playBtn.click()
    await page.waitForTimeout(1000)
    return true
  }
  return false
}

async function findVisibleSeekSlider(page) {
  const sliders = await page.$$(SELECTORS.seekSlider)
  for (let i = 0; i < sliders.length; i++) {
    const visible = await sliders[i].evaluate(function(el) {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 0
    })
    if (visible) return sliders[i]
  }
  return null
}

async function seekSliderTo(page, ratio) {
  const clamped = Math.max(0.05, Math.min(0.95, ratio))
  const slider = await findVisibleSeekSlider(page)
  if (!slider) throw new Error('visible seek slider not found')
  const box = await slider.boundingBox()
  if (!box) throw new Error('seek slider bounding box missing')
  const startX = box.x + 4
  const endX = box.x + (box.width * clamped)
  const y = box.y + (box.height / 2)
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(endX, y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)
}

// Simulate a plain CLICK on the slider track (mouse down + up at one point,
// no drag). This is the exact gesture the user reported as resetting playback.
async function clickSliderAt(page, ratio) {
  const clamped = Math.max(0.05, Math.min(0.95, ratio))
  const slider = await findVisibleSeekSlider(page)
  if (!slider) throw new Error('visible seek slider not found')
  const box = await slider.boundingBox()
  if (!box) throw new Error('seek slider bounding box missing')
  const x = box.x + (box.width * clamped)
  const y = box.y + (box.height / 2)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(600)
}

// Regression guard for "clicking the progress bar stops and resets playback":
// after a click-seek the position must land near the target, playback must
// still be running, and the bar must keep advancing.
async function assertClickSeekKeepsPlaying(page, targetRatio) {
  const before = await getSeekTimes(page)
  if (!before) throw new Error('no seek times before click')
  await clickSliderAt(page, targetRatio)
  await page.waitForTimeout(900)
  const after = await getSeekTimes(page)
  if (!after) throw new Error('no seek times after click')

  const expectedMin = before.duration * Math.max(0.05, targetRatio - 0.15)
  if (after.current < expectedMin) {
    throw new Error('click-seek reset/landed too early: expected >=' + expectedMin.toFixed(2)
      + ' before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after))
  }
  if (!(await isPlaying(page))) {
    throw new Error('click-seek stopped playback: after=' + JSON.stringify(after))
  }
  await waitForProgressAdvance(page, after.current, 0.15, 12000)
}

async function seekViaTestHook(page, ratio) {
  await page.evaluate(function(r) {
    if (window.__abc2bookPlaybackTest && window.__abc2bookPlaybackTest.seek) {
      window.__abc2bookPlaybackTest.seek(r)
      return
    }
    throw new Error('__abc2bookPlaybackTest.seek not available (is npm start running?)')
  }, ratio)
  await page.waitForTimeout(600)
}

async function waitForProgressAdvance(page, beforeCurrent, minDelta, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const t = await getSeekTimes(page)
    if (t && t.current > beforeCurrent + minDelta) return t
    await page.waitForTimeout(300)
  }
  throw new Error('progress did not advance by ' + minDelta + ' (last=' + JSON.stringify(await getSeekTimes(page)) + ')')
}

async function assertSeekMovesPlayheadViaSlider(page, targetRatio, minDelta) {
  const before = await getSeekTimes(page)
  if (!before) throw new Error('no seek times before seek')
  await seekSliderTo(page, targetRatio)
  await page.waitForTimeout(800)
  const after = await getSeekTimes(page)
  if (!after) throw new Error('no seek times after seek')
  const expectedMin = before.duration * Math.max(0.05, targetRatio - 0.12)
  if (after.current < expectedMin) {
    throw new Error('slider seek landed too early: expected >=' + expectedMin.toFixed(2)
      + ' before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after))
  }
  if (Math.abs(after.current - before.current) < minDelta && targetRatio > 0.15) {
    throw new Error('slider seek did not move playhead: before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after))
  }
  return { before: before, after: after }
}

async function assertSeekMovesPlayhead(page, targetRatio, minDelta) {
  const before = await getSeekTimes(page)
  if (!before) throw new Error('no seek times before seek')
  await seekSliderTo(page, targetRatio)
  await page.waitForTimeout(400)
  let after = await getSeekTimes(page)
  const expectedMin = before.duration * Math.max(0.05, targetRatio - 0.12)
  if (!after || after.current < expectedMin) {
    await seekViaTestHook(page, targetRatio)
    after = await getSeekTimes(page)
  }
  if (!after) throw new Error('no seek times after seek')
  if (after.current < expectedMin) {
    throw new Error('seek landed too early: expected >=' + expectedMin.toFixed(2)
      + ' before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after))
  }
  if (Math.abs(after.current - before.current) < minDelta && targetRatio > 0.15) {
    throw new Error('seek did not move playhead: before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after))
  }
  return { before: before, after: after }
}

async function assertSeekLandsNear(page, targetRatio, toleranceSeconds) {
  const before = await getSeekTimes(page)
  if (!before || !(before.duration > 0)) throw new Error('no duration before seek')
  await seekViaTestHook(page, targetRatio)
  await page.waitForTimeout(250)
  const after = await getSeekTimes(page)
  if (!after) throw new Error('no seek times after seek')
  const expected = before.duration * targetRatio
  // Playback keeps advancing after the seek, so allow forward drift but never a
  // landing that is short of (or far past) the requested point.
  if (after.current < expected - toleranceSeconds || after.current > expected + toleranceSeconds + 2) {
    throw new Error('seek landed at wrong place: target=' + expected.toFixed(2)
      + ' got=' + after.current.toFixed(2) + ' (' + JSON.stringify({ before: before, after: after }) + ')')
  }
  return after
}

async function rewindViaTestHook(page) {
  await page.evaluate(function() {
    if (window.__abc2bookPlaybackTest && window.__abc2bookPlaybackTest.rewindToStart) {
      window.__abc2bookPlaybackTest.rewindToStart()
      return
    }
    throw new Error('__abc2bookPlaybackTest.rewindToStart not available')
  })
  await page.waitForTimeout(300)
}

async function assertProgressBarAdvancesWhilePlaying(page, minDelta, timeoutMs) {
  if (!(await isPlaying(page))) throw new Error('expected playing before progress check')
  const t0 = await getSeekTimes(page)
  if (!t0) throw new Error('no seek times')
  await waitForProgressAdvance(page, t0.current, minDelta, timeoutMs)
}

async function runScenario(name, fn) {
  try {
    await fn()
    pass(name)
  } catch (err) {
    fail(name, err)
  }
}

async function verifyCdpReachable(browserURL) {
  const versionUrl = browserURL.replace(/\/$/, '') + '/json/version'
  try {
    const res = await fetch(versionUrl, { signal: AbortSignal.timeout(3000) })
    if (res.ok) return
  } catch (e) {}
  const err = new Error('Cannot reach Chrome DevTools at ' + browserURL)
  err.hint = [
    'Check: curl ' + versionUrl,
    'Chrome 120+ refuses remote debugging on the default profile (~/.config/google-chrome).',
    'Use a separate profile, e.g.:',
    '  ./e2e/setup-debug-profile.sh',
    '  google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-abc2book-debug"',
    'See e2e/README.md',
  ].join('\n')
  throw err
}

async function launchBrowser() {
  if (CDP_URL) {
    console.log(' Connecting via CDP:', CDP_URL)
    await verifyCdpReachable(CDP_URL)
    try {
      return await puppeteer.connect({
        browserURL: CDP_URL,
        defaultViewport: { width: 1280, height: 900 },
      })
    } catch (err) {
      console.error('\nPuppeteer could not attach to', CDP_URL)
      console.error(err.message || err)
      console.error('\n' + (err.hint || 'See e2e/README.md for Chrome remote debugging setup.'))
      throw err
    }
  }
  const launchOpts = {
    headless: HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
    defaultViewport: { width: 1280, height: 900 },
  }
  if (USER_DATA_DIR) {
    console.log(' Using Chrome profile:', USER_DATA_DIR)
    launchOpts.userDataDir = USER_DATA_DIR
  }
  return puppeteer.launch(launchOpts)
}

async function saveDebugScreenshot(page, label) {
  try {
    const dir = path.join(__dirname, 'output')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, label + '.png')
    await page.screenshot({ path: file, fullPage: true })
    console.log(' Debug screenshot:', file)
  } catch (e) {}
}

async function main() {
  console.log('Playback E2E smoke test')
  console.log(' URL:', TEST_URL)

  if (!(await waitForServer(TEST_URL))) {
    console.error('\nDev server not reachable at', BASE)
    console.error('Start it with: npm start')
    process.exit(2)
  }

  const browser = await launchBrowser()
  const page = await browser.newPage()
  page.setDefaultTimeout(TIMEOUT_MS)

  let tuneReady = false

  try {
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
    await page.reload({ waitUntil: 'networkidle2', timeout: TIMEOUT_MS })

    await runScenario('playback test hook available', async function() {
      await page.waitForFunction(function() {
        return window.__abc2bookPlaybackTest && typeof window.__abc2bookPlaybackTest.seek === 'function'
      }, { timeout: 30000 })
    })

    await runScenario('dismiss sync/import blocking dialogs', async function() {
      await dismissBlockingDialogs(page, 120000)
    })

    try {
      await waitForTuneReady(page, 60000)
      tuneReady = true
    } catch (e) {
      await saveDebugScreenshot(page, 'no-tune-loaded')
      const msg = 'Tune/media UI did not load (IndexedDB may be empty in fresh browser profile). '
        + 'Use PLAYBACK_TEST_CDP_URL to connect to Chrome that already has your tunebook open, '
        + 'or PLAYBACK_TEST_USER_DATA_DIR with a profile that has tune data.'
      if (REQUIRE_TUNE) {
        fail('tune data available', new Error(msg))
      } else {
        skip('all playback scenarios', msg)
        console.log('\nE2E skipped — not a playback logic failure.')
        console.log('See e2e/README.md for how to run with your tunebook data.')
        process.exit(0)
      }
    }

    if (!tuneReady) return

    await runScenario('page loads tune route', async function() {
      const hash = await page.evaluate(function() { return window.location.hash })
      if (hash.indexOf('playMedia') < 0 && hash.indexOf('playMidi') < 0) {
        throw new Error('expected playMedia or playMidi route, got ' + hash)
      }
    })

    await runScenario('start playback', async function() {
      await ensurePlaying(page, 60000)
    })

    await runScenario('progress bar appears with duration', async function() {
      await page.waitForSelector(SELECTORS.seekSlider, { visible: true, timeout: 30000 })
      const t = await getSeekTimes(page)
      if (!t || !(t.duration > 0)) throw new Error('no duration on seek bar: ' + JSON.stringify(t))
    })

    await runScenario('time advances while playing', async function() {
      await assertProgressBarAdvancesWhilePlaying(page, 0.25, 20000)
    })

    await runScenario('seek slider drag while playing', async function() {
      await ensurePlaying(page, 30000)
      await assertSeekMovesPlayheadViaSlider(page, 0.55, 0.4)
      if (!(await isPlaying(page))) throw new Error('pause button gone after slider seek')
      await assertProgressBarAdvancesWhilePlaying(page, 0.15, 15000)
    })

    await runScenario('clicking progress bar does not stop/reset playback', async function() {
      await ensurePlaying(page, 30000)
      await assertClickSeekKeepsPlaying(page, 0.6)
    })

    await runScenario('repeated progress-bar clicks keep playing', async function() {
      await ensurePlaying(page, 30000)
      await assertClickSeekKeepsPlaying(page, 0.3)
      await assertClickSeekKeepsPlaying(page, 0.7)
      await assertClickSeekKeepsPlaying(page, 0.5)
    })

    await runScenario('click progress bar after pause/resume keeps playing', async function() {
      await ensurePlaying(page, 30000)
      await clickPause(page)
      await page.waitForTimeout(600)
      await ensurePlaying(page, 30000)
      await assertClickSeekKeepsPlaying(page, 0.45)
    })

    await runScenario('programmatic seek while playing keeps progress', async function() {
      await ensurePlaying(page, 30000)
      await assertSeekMovesPlayhead(page, 0.45, 0.35)
      await ensurePlaying(page, 15000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.15, 15000)
    })

    await runScenario('pause does not show tap-to-play modal', async function() {
      await ensurePlaying(page, 30000)
      await clickPause(page)
      await page.waitForTimeout(5000)
      if (await isTapToPlayVisible(page)) {
        throw new Error('tap-to-play modal appeared after intentional pause')
      }
      if (await isPlaying(page)) throw new Error('still showing pause button after pause')
    })

    await runScenario('time advances after pause and resume', async function() {
      await ensurePlaying(page, 60000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.2, 20000)
    })

    await runScenario('seek works after pause and resume', async function() {
      await ensurePlaying(page, 30000)
      await assertSeekMovesPlayhead(page, 0.35, 0.25)
      if (!(await isPlaying(page))) throw new Error('playback stopped after pause→play→seek')
      await assertProgressBarAdvancesWhilePlaying(page, 0.15, 15000)
    })

    await runScenario('second pause play seek cycle keeps progress bar working', async function() {
      await ensurePlaying(page, 30000)
      await clickPause(page)
      await page.waitForTimeout(500)
      if (await isPlaying(page)) throw new Error('still playing after second pause')

      await ensurePlaying(page, 60000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.15, 20000)

      await assertSeekMovesPlayhead(page, 0.65, 0.25)
      if (!(await isPlaying(page))) throw new Error('playback stopped on second cycle seek')
      await assertProgressBarAdvancesWhilePlaying(page, 0.15, 15000)
    })

    await runScenario('pause stops and stays stopped (no auto-restart)', async function() {
      await ensurePlaying(page, 30000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.25, 20000)
      await clickPause(page)
      await page.waitForTimeout(800)
      if (await isPlaying(page)) throw new Error('pause did not stop playback')
      // It must remain stopped on its own (no recovery effect restarting it).
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(1000)
        if (await isPlaying(page)) throw new Error('playback auto-restarted after pause (iteration ' + i + ')')
      }
    })

    await runScenario('resume after pause continues, does not restart from beginning', async function() {
      await ensurePlaying(page, 30000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.3, 20000)
      const before = await getSeekTimes(page)
      await clickPause(page)
      await page.waitForTimeout(800)
      if (await isPlaying(page)) throw new Error('still playing after pause')
      const paused = await getSeekTimes(page)
      if (paused && before && paused.current < before.current - 2) {
        throw new Error('position jumped backward on pause: ' + JSON.stringify({ before: before, paused: paused }))
      }
      await ensurePlaying(page, 30000)
      await page.waitForTimeout(300)
      const resumed = await getSeekTimes(page)
      // Tight bound: resume must continue from (or very near) the paused position,
      // never snap back toward the start. A loose tolerance previously masked a
      // cross-engine bug where the position was clobbered to 0 on resume.
      if (resumed && paused && resumed.current < paused.current - 1) {
        throw new Error('resume restarted from earlier position: ' + JSON.stringify({ paused: paused, resumed: resumed }))
      }
    })

    await runScenario('rapid duplicate play clicks do not break playback', async function() {
      await ensurePlaying(page, 30000)
      const playBtn = await query(page, SELECTORS.play)
      if (playBtn) { try { await playBtn.click() } catch (e) {} }
      const pauseBtn = await query(page, SELECTORS.pause)
      if (pauseBtn) { try { await pauseBtn.click() } catch (e) {}; try { await pauseBtn.click() } catch (e) {} }
      await page.waitForTimeout(500)
      await ensurePlaying(page, 30000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.15, 15000)
    })

    // Regression for the cross-engine position clobber: on a freshly-loaded media
    // route the MIDI synth is mounted and registers its pause handler. The first
    // pause→resume re-asserts the media route (setMediaLinkNumber), which stops the
    // idle synth. The synth must not write its position (0) into the shared media
    // position, which would restart media playback from the beginning. This must
    // run against a fresh reload because later in a warm session a synth seek-guard
    // suppresses the clobber and masks the bug.
    await runScenario('first pause/resume on fresh media load does not restart from beginning', async function() {
      await page.reload({ waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
      await page.waitForFunction(function() {
        return window.__abc2bookPlaybackTest && typeof window.__abc2bookPlaybackTest.seek === 'function'
      }, { timeout: 30000 })
      await dismissBlockingDialogs(page, 120000)
      await waitForTuneReady(page, 60000)

      await ensurePlaying(page, 60000)
      await assertProgressBarAdvancesWhilePlaying(page, 0.5, 25000)

      await ensurePaused(page, 20000)
      const paused = await getSeekTimes(page)

      await ensurePlaying(page, 30000)
      await page.waitForTimeout(400)
      const resumed = await getSeekTimes(page)
      if (resumed && paused && resumed.current < paused.current - 1) {
        throw new Error('first resume restarted from earlier position: '
          + JSON.stringify({ paused: paused, resumed: resumed }))
      }
    })

    // MIDI playback uses a different engine (abcjs timing callbacks + an optional
    // SoundTouch shifter). Regression guard for: seek landing at the wrong place
    // and rewind not returning to the start, both caused by reading the playhead
    // from a stale/disconnected shifter instead of the timing-callback clock.
    const midiUrl = TEST_URL.replace(/\/playMedia(\/\d+)?/, '/playMidi')
    if (midiUrl !== TEST_URL) {
      await runScenario('midi route loads and plays', async function() {
        await page.goto(midiUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
        await page.reload({ waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
        await page.waitForFunction(function() {
          return window.__abc2bookPlaybackTest && typeof window.__abc2bookPlaybackTest.seek === 'function'
        }, { timeout: 30000 })
        await dismissBlockingDialogs(page, 120000)
        await waitForTuneReady(page, 60000)
        await ensurePlaying(page, 60000)
        await assertProgressBarAdvancesWhilePlaying(page, 0.3, 25000)
      })

      await runScenario('midi seek lands at the clicked place', async function() {
        await ensurePlaying(page, 30000)
        await assertSeekLandsNear(page, 0.5, 1.5)
        if (!(await isPlaying(page))) throw new Error('midi playback stopped after seek')
        await assertProgressBarAdvancesWhilePlaying(page, 0.15, 15000)
      })

      await runScenario('midi seek does not jump left after hold expires', async function() {
        await ensurePlaying(page, 30000)
        const before = await getSeekTimes(page)
        if (!before || !(before.duration > 0)) throw new Error('no duration')
        const targetRatio = 0.55
        const expected = before.duration * targetRatio
        await seekViaTestHook(page, targetRatio)
        await page.waitForTimeout(250)
        let t = await getSeekTimes(page)
        if (!t || t.current < expected - 1.5) {
          throw new Error('seek did not land near target: expected ~' + expected.toFixed(2)
            + ' got ' + JSON.stringify(t))
        }
        // Past the 800ms seek-hold window — regression guard for stale beat
        // callbacks pulling the bar back to the left.
        await page.waitForTimeout(1200)
        t = await getSeekTimes(page)
        if (!t || t.current < expected - 1.5) {
          throw new Error('playhead jumped left after seek hold expired: expected >= '
            + (expected - 1.5).toFixed(2) + ' got ' + JSON.stringify(t))
        }
      })

      await runScenario('midi repeated seeks land correctly', async function() {
        await ensurePlaying(page, 30000)
        await assertSeekLandsNear(page, 0.3, 1.5)
        await assertSeekLandsNear(page, 0.7, 1.5)
        await assertSeekLandsNear(page, 0.5, 1.5)
      })

      await runScenario('midi rewind returns to start with count-in', async function() {
        await ensurePlaying(page, 30000)
        await assertSeekLandsNear(page, 0.6, 1.5)
        await rewindViaTestHook(page)
        const t = await getSeekTimes(page)
        if (!t || t.current > 2) {
          throw new Error('rewind did not return to start: ' + JSON.stringify(t))
        }
        if (!(await isPlaying(page))) {
          throw new Error('rewind stopped playback (expected count-in then resume)')
        }
        // Rewind restarts via metronome count-in, then music advances from 0.
        await waitForProgressAdvance(page, 0, 0.2, 20000)
        if (!(await isPlaying(page))) {
          throw new Error('playback stopped after rewind count-in')
        }
        const after = await getSeekTimes(page)
        if (!after || after.current > 8) {
          throw new Error('after rewind playhead jumped back to old position: ' + JSON.stringify(after))
        }
      })
    }

  } catch (err) {
    await saveDebugScreenshot(page, 'fatal-error')
    throw err
  } finally {
    if (CDP_URL) {
      await page.close()
      browser.disconnect()
    } else {
      await browser.close()
    }
  }

  const failed = results.filter(function(r) { return r.ok === false })
  console.log('')
  console.log(results.filter(function(r) { return r.ok === true }).length + ' passed, ' + failed.length + ' failed')
  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch(function(err) {
  console.error(err)
  process.exit(1)
})
