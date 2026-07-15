'use strict'

const {
  runScenario,
  focusNotationEditor,
  ensureNormalMode,
  ensureNoteInputMode,
  pressKey,
  staffNoteCenters,
  sleep,
  resetNotationFixture,
  clickStaffForNoteInput,
} = require('./helpers')
const { assertNoteSteps } = require('./notation-assertions')

const BASIC_TUNE_ID = 'e2e00000000000000000001'
const EMPTY_TUNE_ID = 'e2e00000000000000000004'

async function openMarksMenu(page) {
  await page.waitForSelector('[data-testid="notation-marks-menu"]', { visible: true })
  await page.click('[data-testid="notation-marks-menu"]')
  await sleep(200)
}

async function clickMarksMenuItem(page, labelPart) {
  await openMarksMenu(page)
  const items = await page.$$('.notation-marks-menu .dropdown-item')
  for (let i = 0; i < items.length; i += 1) {
    const text = await page.evaluate(function(el) { return el.textContent || '' }, items[i])
    if (text.indexOf(labelPart) >= 0) {
      await items[i].click()
      await sleep(200)
      return
    }
  }
  throw new Error('marks menu item not found: ' + labelPart)
}

async function runStaffMarksTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P1: slur mode connects two notes', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await ensureNormalMode(page)
    await clickMarksMenuItem(page, 'Slur mode')
    await page.waitForSelector('[data-testid="notation-mode-badge-slur"]', { timeout: 5000 })
    await sleep(200)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need at least 2 staff notes for slur test')
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(200)
    const afterFirst = await page.evaluate(function() {
      return {
        slurMode: window.__abc2bookNotationTest.getSlurMode(),
        pending: window.__abc2bookNotationTest.getSlurPendingStartId(),
      }
    })
    if (!afterFirst.pending) {
      throw new Error('first slur click should set pending start id, slurMode=' + afterFirst.slurMode)
    }
    const endIndex = centers.length >= 3 ? 2 : 1
    const centers2 = await staffNoteCenters(page, 0)
    await page.mouse.click(centers2[endIndex].x, centers2[endIndex].y)
    await sleep(300)
    const slur = await page.evaluate(function(endNoteIndex) {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const notes = events.filter(function(ev) { return ev.type === 'note' })
      const pendingId = window.__abc2bookNotationTest.getSlurPendingStartId()
      const startIdx = notes.findIndex(function(n) { return n.slurStart })
      const endIdx = notes.findIndex(function(n) { return n.slurEnd })
      return {
        startIdx: startIdx,
        endIdx: endIdx,
        pending: pendingId,
        slurMode: window.__abc2bookNotationTest.getSlurMode(),
        endNoteIndex: endNoteIndex,
      }
    }, endIndex)
    if (slur.pending) throw new Error('slur pending should clear after second click')
    if (slur.startIdx < 0 || slur.endIdx < 0) {
      throw new Error('slur endpoints missing, startIdx=' + slur.startIdx + ' endIdx=' + slur.endIdx)
    }
    if (slur.startIdx >= slur.endIdx) {
      throw new Error('slur should span forward from start to end, startIdx=' + slur.startIdx + ' endIdx=' + slur.endIdx)
    }
    if (slur.slurMode) throw new Error('slur mode should end after completing slur')
  })

  await runScenario(results, 'P1: clear slur removes slur flags on selection', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await clickMarksMenuItem(page, 'Slur mode')
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(200)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await clickMarksMenuItem(page, 'Clear slur')
    await sleep(200)
    const flags = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const selection = window.__abc2bookNotationTest.getSelection()
      const selected = events.filter(function(ev) { return selection.eventIds.indexOf(ev.id) >= 0 })
      return selected.some(function(ev) { return ev.slurStart || ev.slurEnd })
    })
    if (flags) throw new Error('clear slur should remove slur flags on selected note')
  })

  await runScenario(results, 'P1: tuplet mode inserts three triplet notes', async function() {
    await resetNotationFixture(page, EMPTY_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page)
    await page.click('.notation-tuplet-dropdown .btn:first-child')
    await sleep(200)
    const mode = await page.evaluate(function() { return window.__abc2bookNotationTest.getTupletMode() })
    if (!mode || mode.num !== 3) throw new Error('tuplet mode should be triplet 3')
    await pressKey(page, 'c')
    await pressKey(page, 'd')
    await pressKey(page, 'e')
    await sleep(300)
    const tupletState = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const notes = events.filter(function(ev) { return ev.type === 'note' })
      return {
        steps: notes.map(function(n) { return n.pitch.step }),
        nums: notes.map(function(n) { return n.tuplet && n.tuplet.num }),
        mode: window.__abc2bookNotationTest.getTupletMode(),
        abc: window.__abc2bookNotationTest.getVoiceAbc(),
      }
    })
    await assertNoteSteps(page, ['C', 'D', 'E'], 'triplet notes inserted')
    if (tupletState.nums.some(function(n) { return n !== 3; })) {
      throw new Error('all three notes should carry tuplet.num 3')
    }
    if (tupletState.mode != null) throw new Error('tuplet mode should auto-end after 3 notes')
    if (tupletState.abc.indexOf('(3') < 0) throw new Error('ABC should contain (3 tuplet marker')
  })

  await runScenario(results, 'P1: decorations staccato and accent on selection', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await clickMarksMenuItem(page, 'Staccato')
    await sleep(150)
    // Select-once: do NOT re-click before Accent (false-green used to hide stale selection).
    await clickMarksMenuItem(page, 'Accent')
    await sleep(250)
    const deco = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents()[0].decorations || []
    })
    if (deco.indexOf('staccato') < 0) throw new Error('expected staccato decoration')
    if (deco.indexOf('accent') < 0) throw new Error('expected accent decoration')
    const abc = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      return (h.getCommittedVoiceAbc && h.getCommittedVoiceAbc()) || h.getVoiceAbc()
    })
    if (abc.indexOf('.') < 0) throw new Error('ABC should contain staccato dot')
    if (abc.indexOf('!>!') < 0 && abc.indexOf('L') < 0) {
      throw new Error('committed ABC should contain accent token (!>! or L), got: ' + abc)
    }
  })

  await runScenario(results, 'P1: grace note before selection', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await page.waitForSelector('[data-testid="notation-tuplet-menu"]', { visible: true })
    await page.click('[data-testid="notation-tuplet-menu"]')
    await sleep(200)
    const items = await page.$$('.notation-tuplet-dropdown .dropdown-item')
    let clicked = false
    for (let i = 0; i < items.length; i += 1) {
      const text = await page.evaluate(function(el) { return el.textContent || '' }, items[i])
      if (text.indexOf('Grace before') >= 0 || text.indexOf('acciaccatura') >= 0) {
        await items[i].click()
        clicked = true
        break
      }
    }
    if (!clicked) throw new Error('grace before menu item not found')
    await sleep(300)
    const abc = await page.evaluate(function() { return window.__abc2bookNotationTest.getVoiceAbc() })
    if (abc.indexOf('{') < 0) throw new Error('ABC should contain grace note group {...}')
  })

  await runScenario(results, 'P1: dotted entry via dot toggle', async function() {
    await resetNotationFixture(page, EMPTY_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page)
    await pressKey(page, '.')
    const dotted = await page.evaluate(function() { return window.__abc2bookNotationTest.getDotted() })
    if (!dotted) throw new Error('dot toggle should set dotted true')
    await pressKey(page, 'c')
    await sleep(300)
    const beats = await page.evaluate(function() {
      const ev = window.__abc2bookNotationTest.getSessionEvents().find(function(e) { return e.type === 'note' })
      return ev && ev.durationBeats
    })
    if (!beats || beats < 1) throw new Error('dotted note should have positive durationBeats, got ' + beats)
  })
}

module.exports = { runStaffMarksTests }
