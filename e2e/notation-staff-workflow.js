'use strict'

/**
 * One continuous editing session on an empty tune — catches caret/sync regressions
 * that isolated per-feature tests miss (insert at wrong index, drag wrong note, etc.).
 */
const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  ensureNormalMode,
  getVoiceAbc,
  normalizeAbcBody,
  pressKey,
  clickTestId,
  dragStaffNoteByIndex,
  staffNoteCenters,
  clickStaffForNoteInput,
  sleep,
  resetNotationFixture,
} = require('./helpers')
const { NOTATION_E2E_EMPTY_ID, NOTATION_E2E_TUNE_ID } = require('./notation-fixtures')
const { assertNoteSteps, getCaretIndex, assertVoiceAbc } = require('./notation-assertions')

const EMPTY_TUNE_ID = NOTATION_E2E_EMPTY_ID

async function selectNoteByStep(page, step) {
  await ensureNormalMode(page)
  const ok = await page.evaluate(function(stepLetter) {
    return window.__abc2bookNotationTest.selectNoteByStep(stepLetter)
  }, step)
  if (!ok) throw new Error('selectNoteByStep failed for ' + step)
  await sleep(200)
}

async function removeSelectedNote(page) {
  await page.keyboard.down('Control')
  await page.keyboard.press('Delete')
  await page.keyboard.up('Control')
  await sleep(300)
}

async function runStaffWorkflowTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P0: workflow — empty tune add, barline, move, delete, append', async function() {
    await resetNotationFixture(page, EMPTY_TUNE_ID)
    await focusNotationEditor(page)

    await assertNoteSteps(page, [], '1. empty tune loaded')

    // --- Add four quarter notes from an empty staff ---
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page)
    await pressKey(page, 'c')
    await assertNoteSteps(page, ['C'], '2a. after first note')
    await pressKey(page, 'd')
    await assertNoteSteps(page, ['C', 'D'], '2b. after second note')
    await pressKey(page, 'e')
    await assertNoteSteps(page, ['C', 'D', 'E'], '2c. after third note')
    await pressKey(page, 'f')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F'], '2d. after fourth note')
    const caretAfterAdd = await getCaretIndex(page)
    if (caretAfterAdd < 4) {
      throw new Error('2e. caret should be past four notes, got ' + caretAfterAdd)
    }

    // --- Drag third note (E) up two staff steps → G (before barline complicates drag) ---
    await ensureNormalMode(page)
    await focusNotationEditor(page)
    const centersBeforeDrag = await staffNoteCenters(page, 0)
    if (centersBeforeDrag.length < 4) {
      throw new Error('3a. need 4 notes on staff, got ' + centersBeforeDrag.length)
    }
    await page.mouse.click(centersBeforeDrag[2].x, centersBeforeDrag[2].y)
    await sleep(150)
    await dragStaffNoteByIndex(page, 2, 2)
    await assertNoteSteps(page, ['C', 'D', 'G', 'F'], '3b. after dragging E up to G')

    // --- Bar line between D and G (caret + toolbar, mid-score) ---
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    const caretBeforeBar = await getCaretIndex(page)
    if (caretBeforeBar < 2) {
      throw new Error('4a. caret should be after D before barline, got ' + caretBeforeBar)
    }
    await clickTestId(page, 'notation-barline')
    await sleep(400)
    await assertNoteSteps(page, ['C', 'D', 'G', 'F'], '4b. pitches unchanged after barline')
    const barPlacement = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const barIdx = events.findIndex(function(ev) { return ev.type === 'barline' })
      if (barIdx < 0) return { ok: false, reason: 'no barline event' }
      const before = events.slice(0, barIdx).filter(function(ev) {
        return ev.type === 'note' || ev.type === 'chord'
      }).map(function(ev) { return ev.pitch && ev.pitch.step })
      const after = events.slice(barIdx + 1).filter(function(ev) {
        return ev.type === 'note' || ev.type === 'chord'
      }).map(function(ev) { return ev.pitch && ev.pitch.step })
      if (before.join('') !== 'CD' || after.join('') !== 'GF') {
        return { ok: false, reason: 'barline splits ' + before.join(' ') + ' | ' + after.join(' ') }
      }
      return { ok: true, barIdx: barIdx }
    })
    if (!barPlacement.ok) {
      throw new Error('4c. barline should sit between D and G, ' + barPlacement.reason)
    }

    // --- Remove D, then G ---
    await selectNoteByStep(page, 'D')
    await removeSelectedNote(page)
    await assertNoteSteps(page, ['C', 'G', 'F'], '5. after removing D')

    await selectNoteByStep(page, 'G')
    await removeSelectedNote(page)
    await assertNoteSteps(page, ['C', 'F'], '6. after removing G')

    // --- Append A at end in note input (caret at end + sequential entry) ---
    await ensureNoteInputMode(page)
    await page.evaluate(function() {
      window.__abc2bookNotationTest.setCaretAtEnd()
    })
    await sleep(150)
    await pressKey(page, 'a')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'F', 'A'], '7. after appending A at end')

    // --- Duration half note, dotted note, clipboard duplicate, undo ---
    await pressKey(page, '7')
    await pressKey(page, 'b')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'F', 'A', 'B'], '8. after half note B')

    await pressKey(page, '4')
    await pressKey(page, '.')
    await pressKey(page, 'c')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'F', 'A', 'B', 'C'], '9. dotted c appended after half B')

    await ensureNormalMode(page)
    await page.evaluate(function() {
      return window.__abc2bookNotationTest.selectNoteByStep('C')
    })
    await sleep(150)
    await pressKey(page, 'c', { modifier: 'Control' })
    await page.evaluate(function() { window.__abc2bookNotationTest.setCaretAtEnd() })
    await sleep(150)
    await pressKey(page, 'v', { modifier: 'Control' })
    await sleep(300)
    await assertNoteSteps(page, ['C', 'F', 'A', 'B', 'C', 'C'], '10. paste duplicates C at end')

    const beforeUndo = await getVoiceAbc(page)
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await sleep(600)
    const afterUndo = await getVoiceAbc(page)
    if (afterUndo === beforeUndo) throw new Error('11. Ctrl+Z undo should change ABC after paste')
    await assertNoteSteps(page, ['C', 'F', 'A', 'B', 'C'], '11. undo removes pasted C')

    const abcFinal = normalizeAbcBody(await getVoiceAbc(page))
    if (!/C.*F.*A/.test(abcFinal)) {
      throw new Error('12. final ABC should contain C F A in order, got: ' + abcFinal)
    }

    await resetNotationFixture(page, NOTATION_E2E_TUNE_ID)
  })
}

module.exports = { runStaffWorkflowTests }
