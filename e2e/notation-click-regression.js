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
  clickAfterLastNoteHuman,
  dragStaffNoteByIndex,
  sleep,
  resetNotationFixture,
} = require('./helpers')
const { assertEvents, assertVoiceAbc, assertNoteSteps, getCaretIndex, assertSelectionMatchesClick } = require('./notation-assertions')
const { NOTATION_E2E_COPPER_ID } = require('./notation-fixtures')

const BASIC_TUNE_ID = 'e2e00000000000000000001'
const MULTILINE_TUNE_ID = 'e2e00000000000000000003'
const COPPER_TUNE_ID = NOTATION_E2E_COPPER_ID

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
    await assertSelectionMatchesClick(page, 'note:D4', 'click D selects D with caret sync')
  })

  await runScenario(results, 'Click: accidental applies to clicked note without re-select', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need at least 2 notes')
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(150)
    await pressKey(page, '+')
    await sleep(400)
    const body = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      return (h.getCommittedVoiceAbc && h.getCommittedVoiceAbc()) || h.getVoiceAbc()
    })
    if (body.indexOf('^D') < 0 && body.indexOf('^d') < 0) {
      throw new Error('sharp should apply to clicked D in committed ABC: ' + body)
    }
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
    await assertEvents(page, ['note:C4', 'note:D4', 'note:A4:2', 'note:E4', 'note:F4', 'bar:|'], 'A event between D and E')
  })

  await runScenario(results, 'Click: human gap before final bar appends at end', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickAfterLastNoteHuman(page)
    const caret = await getCaretIndex(page)
    const eventCount = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents().length
    })
    if (caret !== eventCount) {
      throw new Error('human end-gap caret should be ' + eventCount + ' (append), got ' + caret)
    }
    await pressKey(page, 'a')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'A'], 'A appended after human end-gap')
    await assertEvents(page, ['note:C4', 'note:D4', 'note:E4', 'note:F4', 'bar:|', 'note:A4:2'], 'A event after bar')
    await assertVoiceAbc(page, 'CDEF | A2', 'ABC append after terminal gap')
  })

  await runScenario(results, 'Click: note input after last note appends at end', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    const caret = await getCaretIndex(page)
    const eventCount = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents().length
    })
    if (caret !== eventCount) {
      throw new Error('caret after last note should be ' + eventCount + ', got ' + caret)
    }
    await pressKey(page, 'a')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'A'], 'A appended after trailing bar')
    await assertEvents(page, ['note:C4', 'note:D4', 'note:E4', 'note:F4', 'bar:|', 'note:A4:2'], 'A event after bar')
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

  // Copper Kettle: mid-bar abcjs-n reset + no trailing | (A2A2^F2BE| GGFE)
  await runScenario(results, 'Click: Copper mid-bar — human end-gap appends (no trailing |)', async function() {
    await resetNotationFixture(page, COPPER_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickAfterLastNoteHuman(page)
    const caret = await getCaretIndex(page)
    const eventCount = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents().length
    })
    if (caret !== eventCount) {
      throw new Error('Copper end-gap caret should be ' + eventCount + ' (append), got ' + caret)
    }
    await pressKey(page, 'c')
    await sleep(300)
    await assertVoiceAbc(page, 'A2A2^F2BE | GGFEC2', 'Copper append after last E (no trailing bar)')
  })

  await runScenario(results, 'Click: Copper mid-bar — drag ^F (index 2) does not rematch as measure-2 F', async function() {
    await resetNotationFixture(page, COPPER_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    await assertNoteSteps(page, ['A', 'A', 'F#1', 'B', 'E', 'G', 'G', 'F', 'E'], 'Copper fixture before drag')
    await dragStaffNoteByIndex(page, 2, 1)
    const after = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const notes = events.filter(function(ev) { return ev.type === 'note' })
      return {
        steps: notes.map(function(n) {
          const p = n.pitch || {}
          return p.step + (p.accidental ? ('#' + p.accidental) : '')
        }),
        abc: (window.__abc2bookNotationTest.getCommittedVoiceAbc
          && window.__abc2bookNotationTest.getCommittedVoiceAbc())
          || window.__abc2bookNotationTest.getVoiceAbc(),
      }
    })
    // ^F up one staff step → ^G (diatonic from F♯ in D)
    if (after.steps[2] !== 'G#1' && after.steps[2] !== 'G') {
      throw new Error('drag should move measure-1 ^F, got index2=' + after.steps[2] + ' all=' + after.steps.join(',') + ' abc=' + after.abc)
    }
    // Measure-2 F (index 7) and last E must stay put — rematch bug used to edit the wrong note.
    if (after.steps[7] !== 'F') {
      throw new Error('measure-2 F must stay F after dragging ^F, got ' + after.steps[7])
    }
    if (after.steps[8] !== 'E') {
      throw new Error('last E must stay E after dragging ^F, got ' + after.steps[8])
    }
  })

  await runScenario(results, 'Click: Copper mid-bar — select measure-2 F once then sharp sticks', async function() {
    await resetNotationFixture(page, COPPER_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    // Index 7 = measure-2 F (abcjs-n2 in m1 — the rematch collision case)
    if (centers.length < 9) throw new Error('expected 9 Copper notes, got ' + centers.length)
    await page.mouse.click(centers[7].x, centers[7].y)
    await sleep(150)
    await pressKey(page, '+')
    await sleep(300)
    const state = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const notes = events.filter(function(ev) { return ev.type === 'note' })
      const m2F = notes[7]
      const body = (h.getCommittedVoiceAbc && h.getCommittedVoiceAbc()) || h.getVoiceAbc()
      const second = String(body).split('|')[1] || ''
      return {
        acc: m2F && m2F.pitch ? m2F.pitch.accidental : null,
        step: m2F && m2F.pitch ? m2F.pitch.step : null,
        secondMeasure: second.trim(),
        carry: h.getAccidentalCarry(),
      }
    })
    if (state.step !== 'F') throw new Error('selection target should be measure-2 F, got ' + state.step)
    if (state.acc !== 1) throw new Error('measure-2 F should be sharp, accidental=' + state.acc)
    if (state.secondMeasure.indexOf('^') < 0) {
      throw new Error('second measure ABC should contain ^ for F, got: ' + state.secondMeasure)
    }
    if (state.carry === 1) throw new Error('sharp must apply to selection, not silently become carry')
  })
}

module.exports = { runClickRegressionTests }
