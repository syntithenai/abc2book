'use strict'

/**
 * Click/caret regression scenarios — staff DOM clicks with exact selection/caret asserts.
 */
const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  ensureNormalMode,
  pressKey,
  staffNoteCenters,
  clickStaffForNoteInput,
  sleep,
  resetNotationFixture,
  setNotationFlag,
} = require('./helpers')
const {
  assertEvents,
  assertVoiceAbc,
  assertSelectionMatchesClick,
  getCaretIndex,
} = require('./notation-assertions')

const BASIC_TUNE_ID = 'e2e00000000000000000001'
const MULTILINE_TUNE_ID = 'e2e00000000000000000003'

async function runClickRegressionTests(page, ctx) {
  const results = ctx.results
  const useResolverV2 = ctx.clickResolverV2 !== false

  if (useResolverV2) {
    await page.evaluate(function() {
      localStorage.setItem('notationClickResolverV2', '1')
    })
  }

  await runScenario(results, 'Click: staff click selects note with caret sync', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need at least 2 notes')
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(200)
    await assertSelectionMatchesClick(page, 'note:D5', 'click D selects D with caret sync')
  })

  await runScenario(results, 'Click: note input between notes inserts at caret', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    const caret = await getCaretIndex(page)
    if (caret !== 2) throw new Error('caret between D and E should be 2, got ' + caret)
    await pressKey(page, 'a')
    await sleep(300)
    await assertVoiceAbc(page, 'C D a E F |', 'A inserted between D and E')
    await assertEvents(page, ['note:C5', 'note:D5', 'note:A4', 'note:E5', 'note:F5', 'bar:|'], 'A event between D and E')
  })

  await runScenario(results, 'Click: multiline second system DOM click selects line-2 note', async function() {
    await resetNotationFixture(page, MULTILINE_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 5) throw new Error('multiline tune needs notes on both lines, got ' + centers.length)
    const sorted = centers.slice().sort(function(a, b) { return a.y - b.y })
    const line2Notes = sorted.filter(function(c) { return c.y > sorted[0].y + 40 })
    if (!line2Notes.length) throw new Error('no line-2 notes found')
    const firstLine2 = line2Notes[0]
    await page.mouse.click(firstLine2.x, firstLine2.y)
    await sleep(250)
    const sel = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const selection = window.__abc2bookNotationTest.getSelection()
      const idx = events.findIndex(function(ev) { return selection.eventIds.indexOf(ev.id) >= 0 })
      const ev = idx >= 0 ? events[idx] : null
      return {
        idx: idx,
        step: ev && ev.pitch ? ev.pitch.step : null,
        octave: ev && ev.pitch ? ev.pitch.octave : null,
        caret: window.__abc2bookNotationTest.getCaretIndex(),
      }
    })
    if (sel.step !== 'D' || sel.octave !== 5) {
      throw new Error('line-2 click should select d (D5), got step=' + sel.step + ' octave=' + sel.octave)
    }
    if (sel.caret !== sel.idx) {
      throw new Error('caret should match selected index on line 2, caret=' + sel.caret + ' idx=' + sel.idx)
    }
  })

  await runScenario(results, 'Click: note input on line 2 inserts note on second system', async function() {
    await resetNotationFixture(page, MULTILINE_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    const centers = await staffNoteCenters(page, 0)
    const sorted = centers.slice().sort(function(a, b) { return a.y - b.y })
    const line2Notes = sorted.filter(function(c) { return c.y > sorted[0].y + 40 })
    if (!line2Notes.length) throw new Error('no line-2 notes for note input')
    const target = line2Notes[0]
    await page.mouse.click(target.x - 20, target.y)
    await sleep(200)
    await pressKey(page, 'a')
    await sleep(300)
    const hasAOnLine2 = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const dIdx = events.findIndex(function(ev) {
        return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D' && ev.pitch.octave === 5
      })
      if (dIdx < 0) return false
      const aBeforeD = events[dIdx - 1]
      return aBeforeD && aBeforeD.type === 'note' && aBeforeD.pitch && aBeforeD.pitch.step === 'A'
    })
    if (!hasAOnLine2) throw new Error('A should be inserted before d on line 2')
  })
}

module.exports = { runClickRegressionTests }
