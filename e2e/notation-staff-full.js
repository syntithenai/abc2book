'use strict'

const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  getVoiceAbc,
  pressKey,
  clickTestId,
  staffNoteCenters,
  sleep,
  resetNotationFixture,
  clickStaffForNoteInput,
} = require('./helpers')
const { assertEvents, assertVoiceAbc, assertNoteSteps } = require('./notation-assertions')

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
    await assertVoiceAbc(page, 'C D E F A2 |', 'half note A2 appended')
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
    const abc = await getVoiceAbc(page)
    if (abc.indexOf('^') < 0) throw new Error('ABC should contain sharp marker, got: ' + abc)
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
  })

  await runScenario(results, 'P1: virtual piano click inserts note', async function() {
    await gotoBasic(page)
    await page.waitForSelector('[data-testid="virtual-piano"]', { visible: true, timeout: 10000 })
    const countBefore = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents().filter(function(ev) {
        return ev.type === 'note' || ev.type === 'chord'
      }).length
    })
    await page.click('[data-testid="virtual-piano"] .virtual-piano-white')
    await sleep(400)
    const countAfter = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents().filter(function(ev) {
        return ev.type === 'note' || ev.type === 'chord'
      }).length
    })
    if (countAfter <= countBefore) throw new Error('virtual piano click should insert a note')
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
      if (abc.indexOf(tokens[i].abc) < 0) {
        throw new Error('expected ' + tokens[i].abc + ' in ABC after menu click, got: ' + abc)
      }
    }
  })

  await runScenario(results, 'P1: system break inserts newline', async function() {
    await gotoBasic(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    await clickTestId(page, 'notation-system-break-btn')
    await sleep(300)
    const abc = await getVoiceAbc(page)
    if (abc.indexOf('\n') < 0 && abc.indexOf('!') < 0) {
      throw new Error('expected system break in ABC, got: ' + JSON.stringify(abc))
    }
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
    const before = await getVoiceAbc(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(200)
    await pressKey(page, 'q')
    await sleep(200)
    const afterQ = await getVoiceAbc(page)
    if (before === afterQ) throw new Error('Q did not change duration')
    const halfBeats = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents()[0].durationBeats
    })
    if (Math.abs(halfBeats - 0.5) > 0.01) {
      throw new Error('Q should halve quarter to eighth (0.5 beats), got ' + halfBeats)
    }
    await pressKey(page, 'w')
    await sleep(200)
    const afterW = await getVoiceAbc(page)
    if (afterW !== before) throw new Error('W should restore duration, before=' + before + ' afterW=' + afterW)
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
    const ok = await page.evaluate(function() {
      return window.__abc2bookNotationTest.selectNoteByStep('G')
    })
    if (!ok) throw new Error('selectNoteByStep G failed on multiline tune')
    await sleep(200)
    const sel = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const selection = window.__abc2bookNotationTest.getSelection()
      const idx = events.findIndex(function(ev) { return selection.eventIds.indexOf(ev.id) >= 0 })
      const step = idx >= 0 && events[idx].pitch ? events[idx].pitch.step : null
      return { idx: idx, step: step }
    })
    if (sel.step !== 'G') throw new Error('should select G on multiline tune, got ' + sel.step)
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
