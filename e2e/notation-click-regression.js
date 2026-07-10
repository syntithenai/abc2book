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
  staffNoteOnSystemLine,
  clickStaffForNoteInput,
  sleep,
  resetNotationFixture,
} = require('./helpers')
const { assertEvents, assertVoiceAbc, assertNoteSteps, getCaretIndex, assertSelectionMatchesClick } = require('./notation-assertions')

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
    await assertNoteSteps(page, ['C', 'D', 'A', 'E', 'F'], 'A inserted between D and E')
    await assertEvents(page, ['note:C5', 'note:D5', 'note:A5:2', 'note:E5', 'note:F5', 'bar:|'], 'A event between D and E')
  })

  await runScenario(results, 'Click: multiline second system DOM click selects line-2 note', async function() {
    await resetNotationFixture(page, MULTILINE_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const pt = await staffNoteOnSystemLine(page, 1)
    if (!pt) throw new Error('no second system line found on multiline tune')
    await page.mouse.click(pt.x, pt.y)
    await sleep(250)
    const sel = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const selection = window.__abc2bookNotationTest.getSelection()
      const dNotes = events.filter(function(ev) {
        return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D'
      })
      const line2D = dNotes[dNotes.length - 1]
      const idx = events.findIndex(function(ev) { return selection.eventIds.indexOf(ev.id) >= 0 })
      const ev = idx >= 0 ? events[idx] : null
      return {
        idx: idx,
        step: ev && ev.pitch ? ev.pitch.step : null,
        octave: ev && ev.pitch ? ev.pitch.octave : null,
        caret: window.__abc2bookNotationTest.getCaretIndex(),
        line2DId: line2D ? line2D.id : null,
        selectedId: selection.eventIds[0] || null,
      }
    })
    if (!sel.line2DId || sel.selectedId !== sel.line2DId) {
      throw new Error('line-2 click should select last D (line 2 d), got step=' + sel.step + ' octave=' + sel.octave)
    }
    if (sel.caret !== sel.idx) {
      throw new Error('caret should match selected index on line 2, caret=' + sel.caret + ' idx=' + sel.idx)
    }
  })

  await runScenario(results, 'Click: note input on line 2 inserts note on second system', async function() {
    await resetNotationFixture(page, MULTILINE_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    const pt = await staffNoteOnSystemLine(page, 1)
    if (!pt) throw new Error('no second system line for note input')
    await page.mouse.click(pt.x - 20, pt.y)
    await sleep(200)
    await pressKey(page, 'a')
    await sleep(300)
    const inserted = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const dNotes = events.filter(function(ev) {
        return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D'
      })
      const line2DIdx = events.findIndex(function(ev) {
        return dNotes.length && ev.id === dNotes[dNotes.length - 1].id
      })
      if (line2DIdx <= 0) return { ok: false, reason: 'no line-2 d index' }
      const before = events[line2DIdx - 1]
      if (!before || before.type !== 'note' || !before.pitch || before.pitch.step !== 'A') {
        return { ok: false, reason: 'expected A before line-2 d, got ' + (before && before.type) }
      }
      return { ok: true }
    })
    if (!inserted.ok) throw new Error(inserted.reason)
  })
}

module.exports = { runClickRegressionTests }
