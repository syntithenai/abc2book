'use strict'

const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  getVoiceAbc,
  getNotationState,
  normalizeAbcBody,
  pressKey,
  clickTestId,
  dragStaffNoteByIndex,
  staffNoteCenters,
  sleep,
  resetNotationFixture,
  clickStaffForNoteInput,
  goToEditorHash,
} = require('./helpers')
const { assertNoteSteps, assertEvents, assertVoiceAbc, getCaretIndex } = require('./notation-assertions')

const BASIC_TUNE_ID = 'e2e00000000000000000001'

async function runStaffCoreTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P0: staff view loads with duration toolbar', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await page.waitForSelector('[data-testid="notation-note-input-btn"]', { visible: true })
    await page.waitForSelector('[data-testid="notation-duration-4"]', { visible: true })
    await assertVoiceAbc(page, 'C D E F |', 'seeded basic tune body')
  })

  await runScenario(results, 'P0: N toggles note input; Esc exits', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await pressKey(page, 'n')
    await page.waitForSelector('.notation-editor-note-input', { timeout: 5000 })
    const mode1 = await page.evaluate(function() { return window.__abc2bookNotationTest.getMode() })
    if (mode1 !== 'noteInput') throw new Error('expected noteInput mode, got ' + mode1)
    await page.waitForSelector('[data-testid="notation-mode-badge-input"]', { timeout: 5000 })
    await pressKey(page, 'Escape')
    await page.waitForFunction(function() {
      return window.__abc2bookNotationTest.getMode() !== 'noteInput'
    }, { timeout: 5000 })
  })

  await runScenario(results, 'P0: note input inserts c d e at caret', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, 'c')
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'C'], 'after first c appended')
    await pressKey(page, 'd')
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'C', 'D'], 'after d')
    await pressKey(page, 'e')
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'C', 'D', 'E'], 'appended c d e at end')
    const caret = await getCaretIndex(page)
    if (caret < 7) throw new Error('expected caret past 7 notes, got: ' + caret)
  })

  await runScenario(results, 'P0: drag 3rd note up transposes E→G (not wrong note)', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await pressKey(page, 'Escape')
    await assertNoteSteps(page, ['C', 'D', 'E', 'F'], 'fixture before drag')
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 4) throw new Error('need 4 rendered notes')
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(150)
    await dragStaffNoteByIndex(page, 2, 2)
    await assertNoteSteps(page, ['C', 'D', 'G', 'F'], 'drag E up 2 steps to G')
  })

  await runScenario(results, 'P0: drag one staff step moves exactly one diatonic step', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(150)
    await dragStaffNoteByIndex(page, 1, 1)
    await assertNoteSteps(page, ['C', 'E', 'E', 'F'], 'D up one diatonic step to E')
  })

  await runScenario(results, 'P0: click note selects; ghost label updates', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await pressKey(page, 'Escape')
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need at least 2 notes')
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(200)
    const match = await page.evaluate(function() {
      const sel = window.__abc2bookNotationTest.getSelection()
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const caret = window.__abc2bookNotationTest.getCaretIndex()
      const dIdx = events.findIndex(function(ev) {
        return (ev.type === 'note' || ev.type === 'chord') && ev.pitch && ev.pitch.step === 'D'
      })
      const dEv = dIdx >= 0 ? events[dIdx] : null
      return {
        hasSelection: sel && sel.eventIds && sel.eventIds.length === 1,
        selectedD: dEv && sel.eventIds[0] === dEv.id,
        caretOnD: caret === dIdx,
      }
    })
    if (!match.hasSelection) throw new Error('expected single-note selection after click')
    if (!match.selectedD) throw new Error('expected D to be selected')
    if (!match.caretOnD) throw new Error('expected caret on D index')
  })

  await runScenario(results, 'P0: select then ArrowUp transposes', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 3) throw new Error('need notes for transpose test')
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(150)
    await pressKey(page, 'ArrowUp')
    await sleep(200)
    await assertNoteSteps(page, ['C', 'D', 'F', 'F'], 'chromatic ArrowUp on E yields F')
  })

  await runScenario(results, 'P0: Delete makes rest; Ctrl+Delete removes', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await pressKey(page, 'Delete')
    await sleep(200)
    await assertNoteSteps(page, ['D', 'E', 'F'], 'Delete on first note (C) should rest C')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centersMid = await staffNoteCenters(page, 0)
    if (centersMid.length < 3) throw new Error('need at least 3 notes for mid-staff delete test')
    await page.mouse.click(centersMid[2].x, centersMid[2].y)
    await sleep(150)
    await pressKey(page, 'Delete')
    await sleep(200)
    await assertNoteSteps(page, ['C', 'D', 'F'], 'Delete on third note (E) should rest E, not D to the left')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers2 = await staffNoteCenters(page, 0)
    await page.mouse.click(centers2[0].x, centers2[0].y)
    await sleep(150)
    await page.keyboard.down('Control')
    await page.keyboard.press('Delete')
    await page.keyboard.up('Control')
    await sleep(200)
    await assertNoteSteps(page, ['D', 'E', 'F'], 'Ctrl+Delete on first note should remove C')
    await assertEvents(page, ['note:D5', 'note:E5', 'note:F5', 'bar:|'], 'Ctrl+Delete removes C event entirely')
  })

  await runScenario(results, 'P0: Backspace vs Delete on middle note', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(150)
    await pressKey(page, 'Backspace')
    await sleep(200)
    await assertNoteSteps(page, ['C', 'D', 'F'], 'Backspace with E selected rests E')
    await assertEvents(page, ['note:C5', 'note:D5', 'rest:1', 'note:F5', 'bar:|'], 'Backspace rests selected E')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers2 = await staffNoteCenters(page, 0)
    await page.mouse.click(centers2[2].x, centers2[2].y)
    await sleep(150)
    await pressKey(page, 'Delete')
    await sleep(200)
    await assertNoteSteps(page, ['C', 'D', 'F'], 'Delete with E selected rests E')
    await assertEvents(page, ['note:C5', 'note:D5', 'rest:1', 'note:F5', 'bar:|'], 'Delete rests selected E')
  })

  await runScenario(results, 'P0: Delete at first and last note boundaries', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await pressKey(page, 'Delete')
    await sleep(200)
    await assertNoteSteps(page, ['D', 'E', 'F'], 'Delete on C at index 0')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centersLast = await staffNoteCenters(page, 0)
    await page.mouse.click(centersLast[3].x, centersLast[3].y)
    await sleep(150)
    await pressKey(page, 'Delete')
    await sleep(200)
    await assertNoteSteps(page, ['C', 'D', 'E'], 'Delete on last note F')
    await assertEvents(page, ['note:C5', 'note:D5', 'note:E5', 'rest:1', 'bar:|'], 'F becomes rest')
  })

  await runScenario(results, 'P0: view switching staff ↔ pianoRoll via route', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    let view = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (view !== 'staff') throw new Error('expected staff view on /music route, got ' + view)

    await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/pianoRoll')
    await sleep(400)
    await focusNotationEditor(page)
    view = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (view !== 'pianoRoll') throw new Error('expected pianoRoll on /pianoRoll route, got ' + view)

    await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/music')
    await sleep(400)
    await focusNotationEditor(page)
    view = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (view !== 'staff') throw new Error('expected staff after returning to /music, got ' + view)
  })

  await runScenario(results, 'P0: 0 and right-click insert rest in note input', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await pressKey(page, '0')
    await sleep(200)
    await assertEvents(page, ['note:C5', 'note:D5', 'rest:2', 'note:E5', 'note:F5', 'bar:|'], '0 key inserts rest at caret')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    const pt = (await staffNoteCenters(page, 0))[2]
    await page.mouse.click(pt.x + 30, pt.y, { button: 'right' })
    await sleep(300)
    await assertEvents(page, ['note:C5', 'note:D5', 'note:E5', 'rest:2', 'note:F5', 'bar:|'], 'right-click inserts rest at caret')
  })

  await runScenario(results, 'P0: barline button inserts | at caret between D and E', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    await assertVoiceAbc(page, 'C D | E F |', 'barline between D and E')
    await assertEvents(page, ['note:C5', 'note:D5', 'bar:|', 'note:E5', 'note:F5', 'bar:|'], 'barline event at caret 2')
  })

  await runScenario(results, 'P0: barline inserts at caret between C and D', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 0 })
    const caret = await getCaretIndex(page)
    if (caret < 1) throw new Error('expected caret after C, got: ' + caret)
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    await assertVoiceAbc(page, 'C | D E F |', 'barline between C and D')
  })
}

module.exports = { runStaffCoreTests }
