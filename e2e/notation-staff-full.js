'use strict'

const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  getVoiceAbc,
  pressKey,
  clickTestId,
  staffNoteCenters,
  staffNoteOnSystemLine,
  sleep,
  resetNotationFixture,
  clickStaffForNoteInput,
  ensureNormalMode,
} = require('./helpers')
const { assertEvents, assertVoiceAbc, assertNoteSteps, assertSelectionMatchesClick } = require('./notation-assertions')

const BASIC_TUNE_ID = 'e2e00000000000000000001'
const TWO_VOICE_TUNE_ID = 'e2e00000000000000000002'
const MULTILINE_TUNE_ID = 'e2e00000000000000000003'
const RICH_TUNE_ID = 'e2e00000000000000000005'

async function gotoBasic(page) {
  await resetNotationFixture(page, BASIC_TUNE_ID)
  await focusNotationEditor(page)
}

async function gotoTune(page, tuneId) {
  await resetNotationFixture(page, tuneId)
  await focusNotationEditor(page)
}

async function openDropdownToggle(page, testId) {
  await page.waitForSelector('[data-testid="' + testId + '"]', { visible: true })
  await page.click('[data-testid="' + testId + '"]')
  await sleep(200)
}

async function runStaffFullTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P1: duration keys change inserted note length', async function() {
    await gotoBasic(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, '5')
    await pressKey(page, 'a')
    await sleep(300)
    const events = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents()
    })
    const inserted = events.filter(function(ev) { return ev.type === 'note' && ev.pitch && ev.pitch.step === 'A' })
    if (!inserted.length) throw new Error('expected inserted A note')
    const beats = inserted[inserted.length - 1].durationBeats
    if (Math.abs(beats - 2) > 0.01) {
      throw new Error('duration key 5 should insert half note (2 beats), got durationBeats=' + beats)
    }
    await assertVoiceAbc(page, 'C D E F | A2', 'half note A2 appended')
  })

  await runScenario(results, 'P1: sharp carry then g inserts sharp', async function() {
    await gotoBasic(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, '+')
    const carry = await page.evaluate(function() { return window.__abc2bookNotationTest.getAccidentalCarry() })
    if (carry !== 1) throw new Error('expected accidental carry 1 after +, got ' + carry)
    await pressKey(page, 'g')
    await sleep(300)
    const afterCarry = await page.evaluate(function() { return window.__abc2bookNotationTest.getAccidentalCarry() })
    if (afterCarry != null) throw new Error('accidental carry should clear after insert')
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'G#1'], 'sharp G appended')
    await assertVoiceAbc(page, 'C D E F | ^G2', 'sharp G in ABC')
  })

  await runScenario(results, 'P1: select once then sharp applies to selection (committed ABC)', async function() {
    await gotoBasic(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(150)
    // Select once — no re-click; + must apply to selection, not become carry.
    await pressKey(page, '+')
    await sleep(300)
    const state = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const d = events.find(function(ev) { return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D' })
      return {
        acc: d && d.pitch ? d.pitch.accidental : null,
        abc: (h.getCommittedVoiceAbc && h.getCommittedVoiceAbc()) || h.getVoiceAbc(),
        carry: h.getAccidentalCarry(),
      }
    })
    if (state.acc !== 1) throw new Error('selected D should be sharp, accidental=' + state.acc)
    if (String(state.abc).indexOf('^') < 0) {
      throw new Error('committed ABC should contain ^ for sharp D, got: ' + state.abc)
    }
    if (state.carry === 1) throw new Error('sharp must apply to selection, not silently become carry')
  })

  await runScenario(results, 'P1: Shift+G adds chord tone', async function() {
    await gotoBasic(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, 'c')
    await pressKey(page, 'G', { modifier: 'Shift' })
    await sleep(300)
    const chord = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      return events.find(function(ev) { return ev.type === 'chord' })
    })
    if (!chord || !chord.pitches || chord.pitches.length !== 2) {
      throw new Error('expected chord with two pitches')
    }
    const steps = chord.pitches.map(function(p) { return p.step }).sort().join('')
    if (steps !== 'CG') throw new Error('expected C+G chord, got steps ' + steps)
    await assertEvents(page, ['note:C4', 'note:D4', 'note:E4', 'note:F4', 'bar:|', 'chord:C4+G4:2'], 'chord appended at end')
  })

  await runScenario(results, 'P1: virtual piano click inserts note', async function() {
    await gotoBasic(page)
    await page.waitForSelector('[data-testid="virtual-piano"]', { visible: true, timeout: 10000 })
    await assertNoteSteps(page, ['C', 'D', 'E', 'F'], 'before piano click')
    await page.click('[data-testid="virtual-piano"] .virtual-piano-white')
    await sleep(400)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'C'], 'piano inserts C at end')
    const mode = await page.evaluate(function() { return window.__abc2bookNotationTest.getMode() })
    if (mode !== 'noteInput') throw new Error('virtual piano should enable note input')
  })

  await runScenario(results, 'P1: barline menu tokens', async function() {
    const tokens = [
      { label: '||', abc: '||' },
      { label: '|:', abc: '|:' },
      { label: ':|', abc: ':|' },
      { label: '|]', abc: '|]' },
    ]
    for (let i = 0; i < tokens.length; i += 1) {
      await gotoBasic(page)
      await ensureNoteInputMode(page)
      await clickStaffForNoteInput(page, { between: 1 })
      await openDropdownToggle(page, 'notation-barline-menu')
      const items = await page.$$('.notation-barline-dropdown .dropdown-menu .dropdown-item')
      let clicked = false
      for (let j = 0; j < items.length; j += 1) {
        const text = await page.evaluate(function(el) { return el.textContent || '' }, items[j])
        if (text.indexOf(tokens[i].label) >= 0) {
          await items[j].click()
          clicked = true
          break
        }
      }
      if (!clicked) throw new Error('barline menu item not found: ' + tokens[i].label)
      await sleep(300)
      const abc = await getVoiceAbc(page)
      const expectedBodies = {
        '||': 'C D || E F |',
        '|:': 'C D |: E F |',
        ':|': 'C D :| E F |',
        '|]': 'C D |] E F |',
      }
      await assertVoiceAbc(page, expectedBodies[tokens[i].abc], 'barline menu ' + tokens[i].label)
    }
  })

  await runScenario(results, 'P1: system break inserts newline', async function() {
    await gotoBasic(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    await clickTestId(page, 'notation-system-break-btn')
    await sleep(300)
    const events = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents()
    })
    const hasBreak = events.some(function(ev) { return ev.type === 'lineBreak' || ev.type === 'systemBreak' })
    if (!hasBreak) throw new Error('expected line/system break event after toolbar click')
  })

  await runScenario(results, 'P1: tie shortcut T on selection', async function() {
    await gotoBasic(page)
    await pressKey(page, 'Escape')
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(200)
    await pressKey(page, 't')
    await sleep(200)
    const state = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents()
    })
    if (!state[0].tieEnd || !state[1].tieStart) {
      throw new Error('expected tieEnd on C and tieStart on D after T key')
    }
    await assertVoiceAbc(page, 'C- D E F |', 'tie between C and D')
  })

  await runScenario(results, 'P1: Q/W halve/double selection duration', async function() {
    await gotoBasic(page)
    await pressKey(page, 'Escape')
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(200)
    await pressKey(page, 'q')
    await sleep(200)
    await assertEvents(page, ['note:C4:0.5', 'note:D4', 'note:E4', 'note:F4', 'bar:|'], 'Q halves C duration')
    await pressKey(page, 'w')
    await sleep(200)
    await assertEvents(page, ['note:C4', 'note:D4', 'note:E4', 'note:F4', 'bar:|'], 'W restores C duration')
  })

  await runScenario(results, 'P1: Ctrl+C/V clipboard round-trip', async function() {
    await gotoBasic(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await pressKey(page, 'c', { modifier: 'Control' })
    await page.evaluate(function() {
      window.__abc2bookNotationTest.setCaretAtEnd()
    })
    await sleep(150)
    await pressKey(page, 'v', { modifier: 'Control' })
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'C'], 'paste duplicates C at end')
    await assertVoiceAbc(page, 'C D E F | C', 'clipboard round-trip ABC')
  })

  await runScenario(results, 'P1: multiline second system line selection', async function() {
    await gotoTune(page, MULTILINE_TUNE_ID)
    await pressKey(page, 'Escape')
    const pt = await staffNoteOnSystemLine(page, 1)
    if (!pt) throw new Error('no second system line on multiline tune')
    await page.mouse.click(pt.x, pt.y)
    await sleep(250)
    await assertSelectionMatchesClick(page, 'note:D5', 'line-2 d selected via DOM click')
  })

  await runScenario(results, 'P1: K:G fixture note input and transpose', async function() {
    await gotoTune(page, RICH_TUNE_ID)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, 'f')
    await sleep(300)
    await assertNoteSteps(page, ['G', 'A', 'B', 'C', 'F'], 'F natural in K:G')
    await page.evaluate(function() {
      return window.__abc2bookNotationTest.selectNoteByStep('F')
    })
    await sleep(150)
    await pressKey(page, 'Escape')
    await sleep(100)
    await pressKey(page, 'ArrowUp')
    await sleep(200)
    const lastStep = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const notes = events.filter(function(ev) { return ev.type === 'note' || ev.type === 'chord' })
      const p = notes[notes.length - 1].pitch
      return p.step + (p.accidental ? '#' + p.accidental : '')
    })
    if (lastStep !== 'F#' && lastStep !== 'F#1') {
      throw new Error('ArrowUp on F should yield F#, got ' + lastStep)
    }
  })

  await runScenario(results, 'P1: toolbar dropdowns open', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)
    for (const id of ['notation-voices-menu', 'notation-tools-menu', 'notation-marks-menu', 'notation-tuplet-menu']) {
      await openDropdownToggle(page, id)
      const menu = await page.$('[data-testid="' + id + '"] + .dropdown-menu, .dropdown-menu.show')
      if (!menu) throw new Error('menu did not open: ' + id)
      await pressKey(page, 'Escape')
    }
  })
}

module.exports = { runStaffFullTests }
