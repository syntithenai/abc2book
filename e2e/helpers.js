'use strict'

const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')

const BASE = process.env.NOTATION_TEST_BASE || process.env.PLAYBACK_TEST_BASE || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS !== '0'
const TIMEOUT_MS = parseInt(process.env.NOTATION_TEST_TIMEOUT || process.env.PLAYBACK_TEST_TIMEOUT || '120000', 10)
const CDP_URL = process.env.NOTATION_TEST_CDP_URL || process.env.PLAYBACK_TEST_CDP_URL || ''
const USER_DATA_DIR = process.env.NOTATION_TEST_USER_DATA_DIR || process.env.PLAYBACK_TEST_USER_DATA_DIR || ''
const SYNC_ACTION = process.env.NOTATION_TEST_SYNC_ACTION || process.env.PLAYBACK_TEST_SYNC_ACTION || 'merge'

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); })
}

function patchPageCompat(page) {
  if (!page.waitForTimeout) {
    page.waitForTimeout = sleep
  }
}

const DIALOG_SELECTORS = {
  mergeDialog: '[data-testid="merge-warning-dialog"]',
  mergeButton: '[data-testid="merge-warning-merge"]',
  mergeDiscard: '[data-testid="merge-warning-discard"]',
  importDialog: '[data-testid="import-warning-dialog"]',
  importButton: '[data-testid="import-warning-confirm"]',
  tapModal: '[data-testid="tap-to-play-modal"], .modal.show',
}

function pass(results, name) {
  results.push({ name: name, ok: true })
  console.log('  ok', name)
}

function fail(results, name, err) {
  results.push({ name: name, ok: false, error: err.message || String(err) })
  console.error(' FAIL', name)
  console.error('     ', err.message || err)
}

function skip(results, name, reason) {
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

async function verifyCdpReachable(browserURL) {
  const versionUrl = browserURL.replace(/\/$/, '') + '/json/version'
  try {
    const res = await fetch(versionUrl, { signal: AbortSignal.timeout(3000) })
    if (res.ok) return
  } catch (e) {}
  throw new Error('Cannot reach Chrome DevTools at ' + browserURL)
}

async function launchBrowser() {
  if (CDP_URL) {
    console.log(' Connecting via CDP:', CDP_URL)
    await verifyCdpReachable(CDP_URL)
    return puppeteer.connect({
      browserURL: CDP_URL,
      defaultViewport: { width: 1280, height: 900 },
    })
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

async function getPageState(page) {
  return page.evaluate(function(sels) {
    function visible(el) {
      if (!el) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    const mergeTitle = document.querySelector('.modal-title')
    return {
      mergeWarning: visible(document.querySelector(sels.mergeDialog))
        || (mergeTitle && mergeTitle.textContent.indexOf('Update Warning') >= 0),
      importWarning: visible(document.querySelector(sels.importDialog)),
    }
  }, DIALOG_SELECTORS)
}

async function dismissBlockingDialogs(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await getPageState(page)
    if (state.mergeWarning) {
      const clicked = await page.evaluate(function(preferDiscard) {
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
        console.log(' Dismissing sync dialog (' + clicked + ')...')
        await page.waitForFunction(function() {
          const title = document.querySelector('.modal-title')
          return !(title && title.textContent.indexOf('Update Warning') >= 0)
        }, { timeout: 60000 })
        await sleep(1000)
        continue
      }
    }
    if (state.importWarning) {
      const btn = await page.$(DIALOG_SELECTORS.importButton)
      if (btn) {
        console.log(' Dismissing import warning dialog...')
        await btn.click()
        await page.waitForFunction(function() {
          return !document.querySelector('[data-testid="import-warning-dialog"]')
        }, { timeout: 60000 })
        await sleep(1000)
        continue
      }
    }
    if (!state.mergeWarning && !state.importWarning) return
    await sleep(500)
  }
  throw new Error('blocking sync/import dialog still visible after ' + timeoutMs + 'ms')
}

async function waitForNotationHook(page, timeoutMs) {
  await page.waitForFunction(function() {
    return window.__abc2bookNotationTest
      && typeof window.__abc2bookNotationTest.getVoiceAbc === 'function'
  }, { timeout: timeoutMs || 30000 })
}

async function goToEditorHash(page, hash) {
  await page.evaluate(function(h) {
    window.location.hash = h
  }, hash)
  await waitForNotationHook(page, 60000)
  await page.waitForSelector('[data-testid="notation-editor"]', { timeout: 30000 })
}

async function goToEditorView(page, tuneId, view) {
  const tab = view || 'music'
  await goToEditorHash(page, '#/editor/' + encodeURIComponent(tuneId) + '/' + tab)
}

async function seedNotationFixtures(page) {
  const origin = new URL(BASE.split('#')[0]).origin
  await page.goto(origin + '/?seed=notation-basic', { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await dismissBlockingDialogs(page, 60000)
  await page.waitForFunction(function() {
    return typeof window.__abc2bookE2ESeed === 'function'
  }, { timeout: 30000 })
  await page.evaluate(function() {
    return window.__abc2bookE2ESeed({ replace: true })
  })
  await sleep(500)
}

async function navigateToNotationEditor(page, url) {
  await seedNotationFixtures(page)
  const hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#')) : url
  await page.evaluate(function(h) {
    window.location.hash = h
  }, hash)
  await waitForNotationHook(page, 60000)
  await page.waitForSelector('[data-testid="notation-editor"]', { timeout: 30000 })
  await page.waitForSelector('[data-testid="notation-staff-wrap"] .abcjs-note, [data-testid="notation-staff-wrap"] .abcjs-rest', { timeout: 30000 })
}

async function focusNotationEditor(page) {
  await page.click('[data-testid="notation-editor"]')
  await sleep(100)
}

async function ensureNormalMode(page) {
  await focusNotationEditor(page)
  const mode = await page.evaluate(function() {
    return window.__abc2bookNotationTest.getMode()
  })
  if (mode === 'noteInput') {
    await pressKey(page, 'Escape')
    await page.waitForFunction(function() {
      return window.__abc2bookNotationTest.getMode() !== 'noteInput'
    }, { timeout: 5000 })
  }
}

async function ensureNoteInputMode(page) {
  await focusNotationEditor(page)
  const mode = await page.evaluate(function() {
    return window.__abc2bookNotationTest.getMode()
  })
  if (mode !== 'noteInput') {
    await clickTestId(page, 'notation-note-input-btn')
  }
  await page.waitForFunction(function() {
    return window.__abc2bookNotationTest.getMode() === 'noteInput'
  }, { timeout: 5000 })
}

async function getVoiceAbc(page) {
  return page.evaluate(function() {
    return window.__abc2bookNotationTest.getVoiceAbc()
  })
}

async function getNotationState(page) {
  return page.evaluate(function() {
    const h = window.__abc2bookNotationTest
    return {
      abc: h.getVoiceAbc(),
      mode: h.getMode(),
      view: h.getView(),
      caretIndex: h.getCaretIndex(),
      selection: h.getSelection(),
      events: h.getSessionEvents(),
    }
  })
}

function normalizeAbcBody(abc) {
  return String(abc || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

async function pressKey(page, key, opts) {
  const options = opts || {}
  const mod = options.modifier
  if (mod) await page.keyboard.down(mod)
  await page.keyboard.press(key)
  if (mod) await page.keyboard.up(mod)
  await sleep(options.delay || 150)
}

async function clickTestId(page, testId) {
  const sel = '[data-testid="' + testId + '"]'
  await page.waitForSelector(sel, { visible: true, timeout: 15000 })
  await page.click(sel)
  await sleep(150)
}

async function staffNoteCenters(page, voiceClass) {
  return page.evaluate(function(vc) {
    function className(el) {
      if (!el || !el.className) return ''
      if (typeof el.className === 'string') return el.className
      if (el.className.baseVal != null) return el.className.baseVal
      return ''
    }
    function classNum(el, prefix) {
      const parts = className(el).split(/\s+/)
      for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].indexOf(prefix) === 0) {
          const n = parseInt(parts[i].slice(prefix.length), 10)
          if (!isNaN(n)) return n
        }
      }
      return null
    }
    /** Never sort by notehead top — pitch contour looks like multiple system lines. */
    function sortReadingOrder(notes) {
      return notes.slice().sort(function(a, b) {
        const lineA = classNum(a, 'abcjs-l')
        const lineB = classNum(b, 'abcjs-l')
        if (lineA != null && lineB != null && lineA !== lineB) return lineA - lineB
        const mA = classNum(a, 'abcjs-m')
        const mB = classNum(b, 'abcjs-m')
        if (mA != null && mB != null && mA !== mB) return mA - mB
        return a.getBoundingClientRect().left - b.getBoundingClientRect().left
      })
    }
    const wrap = document.querySelector('[data-testid="notation-staff-wrap"]')
    if (!wrap) return []
    let notes
    if (vc != null) {
      notes = Array.from(wrap.querySelectorAll('.abcjs-v' + vc + ' .abcjs-note, .abcjs-v' + vc + ' .abcjs-rest'))
    }
    if (!notes || !notes.length) {
      notes = Array.from(wrap.querySelectorAll('.abcjs-note, .abcjs-rest'))
    }
    notes = sortReadingOrder(notes)
    return notes.map(function(el) {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
  }, voiceClass)
}

async function resetNotationFixture(page, tuneId) {
  await page.evaluate(function() {
    return window.__abc2bookE2ESeed({ replace: true })
  })
  await sleep(300)
  await goToEditorHash(page, '#/editor/' + encodeURIComponent(tuneId || 'e2e00000000000000000001') + '/music')
  await sleep(400)
  await ensureNormalMode(page)
}

async function staffStepPixels(page) {
  return page.evaluate(function() {
    const wrap = document.querySelector('[data-testid="notation-staff-wrap"]')
    if (!wrap) return 14
    const staff = wrap.querySelector('.abcjs-staff')
    if (staff) {
      const lineEls = Array.from(staff.querySelectorAll('path, line')).filter(function(el) {
        const r = el.getBoundingClientRect()
        return r.height <= 3 && r.width > 20
      })
      const tops = lineEls.map(function(el) { return el.getBoundingClientRect().top }).sort(function(a, b) { return a - b })
      const uniq = []
      tops.forEach(function(t) {
        if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 2) uniq.push(t)
      })
      if (uniq.length >= 2) {
        let best = null
        for (let i = 0; i < uniq.length - 1; i += 1) {
          const space = uniq[i + 1] - uniq[i]
          if (space >= 5 && space <= 28 && (best == null || space < best)) best = space
        }
        if (best != null) return best / 2
      }
    }
    const notes = Array.from(wrap.querySelectorAll('.abcjs-note'))
    if (notes.length >= 4) {
      const eRect = notes[2].getBoundingClientRect()
      const fRect = notes[3].getBoundingClientRect()
      const dy = Math.abs(fRect.top - eRect.top)
      if (dy > 1) return dy
    }
    for (let i = 0; i < notes.length - 1; i += 1) {
      const dy = Math.abs(
        notes[i + 1].getBoundingClientRect().top - notes[i].getBoundingClientRect().top
      )
      if (dy > 1) return dy
    }
    return 14
  })
}

async function dragStaffNoteByIndex(page, noteIndex, staffSteps) {
  const stepPx = await staffStepPixels(page)
  // Extra half-step bias so rounding never under-counts intentional multi-step drags.
  const deltaY = -((staffSteps + 0.45) * stepPx)
  const centers = await staffNoteCenters(page, 0)
  const pt = centers[noteIndex]
  if (!pt) throw new Error('staff note index ' + noteIndex + ' not found (' + centers.length + ' notes)')
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  await page.mouse.move(pt.x, pt.y + deltaY, { steps: Math.max(8, Math.abs(staffSteps) * 4) })
  await page.mouse.up()
  await sleep(500)
}

async function clickStaffGap(page, clientX, clientY) {
  await page.mouse.click(clientX, clientY)
  await sleep(200)
}

async function staffNoteOnSystemLine(page, lineIndex) {
  return page.evaluate(function(li) {
    const wrap = document.querySelector('[data-testid="notation-staff-wrap"]')
    if (!wrap) return null
    const notes = Array.from(wrap.querySelectorAll('.abcjs-note'))
    const withRect = notes.map(function(el) {
      const r = el.getBoundingClientRect()
      return { top: r.top, left: r.left, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    withRect.sort(function(a, b) {
      if (Math.abs(a.top - b.top) > 8) return a.top - b.top
      return a.left - b.left
    })
    const lines = []
    withRect.forEach(function(n) {
      if (!lines.length || n.top - lines[lines.length - 1][0].top > 30) lines.push([n])
      else lines[lines.length - 1].push(n)
    })
    const row = lines[li]
    if (!row || !row.length) return null
    return row[0]
  }, lineIndex)
}

async function clickStaffForNoteInput(page, options) {
  const opts = options || {}
  const centers = await staffNoteCenters(page, 0)
  let x
  let y
  if (opts.atStart && centers.length) {
    x = centers[0].x - 40
    y = centers[0].y
  } else if (opts.between != null && centers.length > opts.between + 1) {
    const left = centers[opts.between]
    const right = centers[opts.between + 1]
    x = left.x + (right.x - left.x) * 0.5
    y = left.y
  } else if (opts.noteIndex != null && centers[opts.noteIndex]) {
    const pt = centers[opts.noteIndex]
    x = opts.after ? pt.x + 24 : pt.x - 20
    y = pt.y
  } else if (opts.atEnd && centers.length) {
    const last = centers[centers.length - 1]
    // Past last note and typical trailing bar so caret lands at events.length.
    x = last.x + 80
    y = last.y
  } else {
    const pt = await page.evaluate(function() {
      const wrap = document.querySelector('[data-testid="notation-staff-wrap"]')
      if (!wrap) return null
      const staff = wrap.querySelector('.abcjs-staff')
      const rect = staff ? staff.getBoundingClientRect() : wrap.getBoundingClientRect()
      return { x: rect.left + 32, y: rect.top + rect.height / 2 }
    })
    if (!pt) throw new Error('staff wrap not found for caret click')
    x = pt.x
    y = pt.y
  }
  await page.mouse.click(x, y)
  await sleep(200)
}

/** Human end-append: click past the reading-order last note (gap before trailing | if present). */
async function clickAfterLastNoteHuman(page) {
  const pt = await page.evaluate(function() {
    function className(el) {
      if (!el || !el.className) return ''
      if (typeof el.className === 'string') return el.className
      if (el.className.baseVal != null) return el.className.baseVal
      return ''
    }
    function classNum(el, prefix) {
      const parts = className(el).split(/\s+/)
      for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].indexOf(prefix) === 0) {
          const n = parseInt(parts[i].slice(prefix.length), 10)
          if (!isNaN(n)) return n
        }
      }
      return null
    }
    const wrap = document.querySelector('[data-testid="notation-staff-wrap"]')
    if (!wrap) return null
    const notes = Array.from(wrap.querySelectorAll('.abcjs-note')).slice().sort(function(a, b) {
      const lineA = classNum(a, 'abcjs-l')
      const lineB = classNum(b, 'abcjs-l')
      if (lineA != null && lineB != null && lineA !== lineB) return lineA - lineB
      const mA = classNum(a, 'abcjs-m')
      const mB = classNum(b, 'abcjs-m')
      if (mA != null && mB != null && mA !== mB) return mA - mB
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left
    })
    if (!notes.length) return null
    const last = notes[notes.length - 1]
    const lr = last.getBoundingClientRect()
    const bars = Array.from(wrap.querySelectorAll('.abcjs-bar'))
    let barLeft = null
    bars.forEach(function(b) {
      const br = b.getBoundingClientRect()
      if (br.left >= lr.right - 2) {
        if (barLeft == null || br.left < barLeft) barLeft = br.left
      }
    })
    // Mid-bar only (no trailing |): click just past last notehead. With trailing |: gap before it.
    const x = barLeft != null ? (lr.right + barLeft) * 0.5 : lr.right + 12
    return { x: x, y: lr.top + lr.height / 2 }
  })
  if (!pt) throw new Error('could not resolve human end-gap click')
  await page.mouse.click(pt.x, pt.y)
  await sleep(200)
}

async function dragStaffNoteFarOffGlyph(page, noteIndex) {
  const centers = await staffNoteCenters(page, 0)
  const pt = centers[noteIndex]
  if (!pt) throw new Error('staff note index ' + noteIndex + ' not found')
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  // Few steps, large leap — mimics fast flick that inflated abcjs drag.step.
  await page.mouse.move(pt.x, pt.y - 220, { steps: 2 })
  await page.mouse.up()
  await sleep(500)
}

async function setNotationFlag(page, key, value) {
  await page.evaluate(function(k, v) {
    localStorage.setItem(k, v)
  }, key, value)
}

async function runScenario(results, name, fn) {
  try {
    await fn()
    pass(results, name)
  } catch (err) {
    fail(results, name, err)
  }
}

module.exports = {
  patchPageCompat,
  sleep,
  BASE,
  TIMEOUT_MS,
  HEADLESS,
  CDP_URL,
  pass,
  fail,
  skip,
  runScenario,
  waitForServer,
  launchBrowser,
  saveDebugScreenshot,
  dismissBlockingDialogs,
  waitForNotationHook,
  resetNotationFixture,
  goToEditorHash,
  goToEditorView,
  seedNotationFixtures,
  navigateToNotationEditor,
  focusNotationEditor,
  ensureNormalMode,
  ensureNoteInputMode,
  getVoiceAbc,
  getNotationState,
  normalizeAbcBody,
  pressKey,
  clickTestId,
  staffNoteCenters,
  staffNoteOnSystemLine,
  staffStepPixels,
  dragStaffNoteByIndex,
  dragStaffNoteFarOffGlyph,
  clickStaffGap,
  clickStaffForNoteInput,
  clickAfterLastNoteHuman,
  setNotationFlag,
}
