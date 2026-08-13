'use strict'

/**
 * Insert-placement E2E — caret-before-insert and exact post-insert state.
 * Catches stale-caret bugs where inserts land in the last-edited section.
 */
const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  ensureNormalMode,
  pressKey,
  clickTestId,
  staffNoteCenters,
  staffNoteOnSystemLine,
  clickStaffForNoteInput,
  clickAfterLastNoteHuman,
  clickStaffVoiceNote,
  sleep,
  resetNotationFixture,
} = require('./helpers')
const {
  assertEvents,
  assertVoiceAbc,
  assertNoteSteps,
  assertCaretIndex,
  assertSelectionMatchesClick,
} = require('./notation-assertions')
const {
  NOTATION_E2E_TUNE_ID,
  NOTATION_E2E_MULTILINE_ID,
  NOTATION_E2E_TWO_VOICE_ID,
  NOTATION_E2E_COPPER_ID,
} = require('./notation-fixtures')

const BASIC_TUNE_ID = NOTATION_E2E_TUNE_ID
const MULTILINE_TUNE_ID = NOTATION_E2E_MULTILINE_ID
const TWO_VOICE_TUNE_ID = NOTATION_E2E_TWO_VOICE_ID
const COPPER_TUNE_ID = NOTATION_E2E_COPPER_ID

async function getEventCount(page) {
  return page.evaluate(function() {
    return window.__abc2bookNotationTest.getSessionEvents().length
  })
}

function isP1Tier(ctx) {
  const tier = (ctx && ctx.tier) || process.env.NOTATION_E2E_TIER || '0'
  return tier === '1' || tier === 'full' || tier === 'p1'
}

async function runBlockA(page, results) {
  await runScenario(results, 'Insert: atStart — G before C', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atStart: true })
    await assertCaretIndex(page, 0, 'atStart')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['G', 'C', 'D', 'E', 'F'], 'G before C')
    await assertEvents(page, [
      'note:G4:2', 'note:C4', 'note:D4', 'note:E4', 'note:F4', 'bar:|',
    ], 'G event at index 0')
  })

  await runScenario(results, 'Insert: between C–D', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 0 })
    await assertCaretIndex(page, 1, 'between C and D')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'G', 'D', 'E', 'F'], 'G between C and D')
    await assertEvents(page, [
      'note:C4', 'note:G4:2', 'note:D4', 'note:E4', 'note:F4', 'bar:|',
    ], 'G event at index 1')
  })

  await runScenario(results, 'Insert: between D–E', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await assertCaretIndex(page, 2, 'between D and E')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'G', 'E', 'F'], 'G between D and E')
    await assertEvents(page, [
      'note:C4', 'note:D4', 'note:G4:2', 'note:E4', 'note:F4', 'bar:|',
    ], 'G event at index 2')
  })

  await runScenario(results, 'Insert: between E–F', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    await assertCaretIndex(page, 3, 'between E and F')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'G', 'F'], 'G between E and F')
    await assertEvents(page, [
      'note:C4', 'note:D4', 'note:E4', 'note:G4:2', 'note:F4', 'bar:|',
    ], 'G event at index 3')
  })

  await runScenario(results, 'Insert: human end-gap before bar', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickAfterLastNoteHuman(page)
    const eventCount = await getEventCount(page)
    await assertCaretIndex(page, eventCount, 'human end-gap append')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'G'], 'G appended after bar')
    await assertVoiceAbc(page, 'CDEF | G2', 'G after terminal bar')
  })

  await runScenario(results, 'Insert: left half of D (before D)', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { noteIndex: 1, after: false })
    await assertCaretIndex(page, 1, 'left half of D')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'G', 'D', 'E', 'F'], 'G before D')
  })

  await runScenario(results, 'Insert: right half of D (after D)', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { noteIndex: 1, after: true })
    await assertCaretIndex(page, 2, 'right half of D')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'G', 'E', 'F'], 'G after D')
  })
}

async function runBlockB(page, results) {
  await runScenario(results, 'Insert: after append, click between C–D', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, 'a')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'F', 'A'], 'A appended first')
    await clickStaffForNoteInput(page, { between: 0 })
    await assertCaretIndex(page, 1, 'between C and D after prior append')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'G', 'D', 'E', 'F', 'A'], 'G between C and D not at end')
  })

  await runScenario(results, 'Insert: after mid insert, click atStart', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'E', 'G', 'F'], 'G between E and F first')
    await clickStaffForNoteInput(page, { atStart: true })
    await assertCaretIndex(page, 0, 'atStart after mid insert')
    await pressKey(page, 'a')
    await sleep(300)
    await assertNoteSteps(page, ['A', 'C', 'D', 'E', 'G', 'F'], 'A at start not at prior slot')
  })

  await runScenario(results, 'Insert: multiline line1 end then line2', async function() {
    await resetNotationFixture(page, MULTILINE_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    // Last note on first system line is lowercase c (reading-order index 7).
    await clickStaffForNoteInput(page, { noteIndex: 7, after: true })
    await pressKey(page, 'a')
    await sleep(300)
    const domNoteIndex = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const dNotes = events.filter(function(ev) {
        return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D'
      })
      const line2D = dNotes[dNotes.length - 1]
      if (!line2D) return -1
      let domIdx = 0
      for (let i = 0; i < events.length; i += 1) {
        if (events[i].id === line2D.id) return domIdx
        if (events[i].type === 'note' || events[i].type === 'chord' || events[i].type === 'rest') {
          domIdx += 1
        }
      }
      return -1
    })
    if (domNoteIndex < 0) throw new Error('could not find line-2 d DOM index')
    await clickStaffForNoteInput(page, { noteIndex: domNoteIndex, after: false })
    await sleep(250)
    const line2Caret = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const dNotes = events.filter(function(ev) {
        return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D'
      })
      const line2D = dNotes[dNotes.length - 1]
      return events.findIndex(function(ev) { return ev.id === line2D.id })
    })
    await assertCaretIndex(page, line2Caret, 'caret before line-2 d')
    await pressKey(page, 'g')
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
      if (!before || before.type !== 'note' || !before.pitch || before.pitch.step !== 'G') {
        return {
          ok: false,
          reason: 'expected G before line-2 d, got ' + (before && before.pitch ? before.pitch.step : before && before.type),
        }
      }
      return { ok: true }
    })
    if (!inserted.ok) throw new Error(inserted.reason)
  })

  await runScenario(results, 'Insert: Copper mid-bar between ^F and B', async function() {
    await resetNotationFixture(page, COPPER_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    await assertCaretIndex(page, 3, 'between ^F and B')
    await pressKey(page, 'c')
    await sleep(300)
    await assertNoteSteps(
      page,
      ['A', 'A', 'F#1', 'C', 'B', 'E', 'G', 'G', 'F', 'E'],
      'C between ^F and B not in measure 2'
    )
    await assertVoiceAbc(page, 'A2A2^F2C2BE | GGFE', 'Copper mid-bar C insert')
  })
}

async function runBlockC(page, results) {
  await runScenario(results, 'Rest: 0 key at between E–F', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    await assertCaretIndex(page, 3, 'between E and F')
    await pressKey(page, '0')
    await sleep(300)
    await assertEvents(page, [
      'note:C4', 'note:D4', 'note:E4', 'rest:2', 'note:F4', 'bar:|',
    ], 'rest at index 3')
  })

  await runScenario(results, 'Rest: right-click at between C–D', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need at least 2 notes')
    const x = centers[0].x + (centers[1].x - centers[0].x) * 0.5
    const y = centers[0].y
    await page.mouse.click(x, y, { button: 'right' })
    await sleep(300)
    await assertEvents(page, [
      'note:C4', 'rest:2', 'note:D4', 'note:E4', 'note:F4', 'bar:|',
    ], 'right-click rest at index 1')
  })

  await runScenario(results, 'Barline: toolbar at between D–E', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await assertCaretIndex(page, 2, 'between D and E')
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    await assertVoiceAbc(page, 'CD | EF |', 'barline between D and E')
    await assertEvents(page, [
      'note:C4', 'note:D4', 'bar:|', 'note:E4', 'note:F4', 'bar:|',
    ], 'barline event at index 2')
  })

  await runScenario(results, 'Barline: normal mode before selected E', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 3) throw new Error('need at least 3 notes')
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(200)
    await assertSelectionMatchesClick(page, 'note:E4', 'E selected')
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    await assertVoiceAbc(page, 'CD | EF |', 'barline before selected E')
    const barIdx = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      return events.findIndex(function(ev) { return ev.type === 'barline' && ev.barToken === '|' })
    })
    if (barIdx !== 2) throw new Error('barline should be at index 2 (before E), got ' + barIdx)
    const stillE = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const selection = h.getSelection()
      const ev = events.find(function(e) { return selection.eventIds.indexOf(e.id) >= 0 })
      return ev && ev.pitch ? ev.pitch.step : null
    })
    if (stillE !== 'E') throw new Error('selection should remain on E after barline insert')
  })
}

async function runBlockCP1(page, results) {
  await runScenario(results, 'Barline: range C–E inserts before C', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 4) throw new Error('need 4 notes for range select')
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await page.keyboard.down('Shift')
    await page.mouse.click(centers[2].x, centers[2].y)
    await page.keyboard.up('Shift')
    await sleep(200)
    const selCount = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSelection().eventIds.length
    })
    if (selCount !== 3) {
      throw new Error('expected 3-note range C–E selected before barline, got ' + selCount)
    }
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    await assertVoiceAbc(page, '| CDEF |', 'barline before leftmost selected C')
    const barIdx = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents().findIndex(function(ev) {
        return ev.type === 'barline'
      })
    })
    if (barIdx !== 0) throw new Error('barline should be at index 0, got ' + barIdx)
  })

  await runScenario(results, 'Empty measure: Ctrl+B before selected D', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need at least 2 notes')
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(200)
    await assertSelectionMatchesClick(page, 'note:D4', 'D selected')
    await pressKey(page, 'b', { modifier: 'Control' })
    await sleep(400)
    const layout = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const dIdx = events.findIndex(function(ev) {
        return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D'
      })
      const beforeD = events.slice(0, dIdx)
      return {
        dIdx: dIdx,
        beforeTypes: beforeD.map(function(ev) { return ev.type }),
        abc: window.__abc2bookNotationTest.getVoiceAbc(),
      }
    })
    if (layout.dIdx < 2) throw new Error('D should move right after empty measure insert')
    if (layout.beforeTypes[0] !== 'note' || layout.beforeTypes[1] !== 'rest' || layout.beforeTypes[2] !== 'barline') {
      throw new Error('expected C rest bar before D, got ' + layout.beforeTypes.join(', '))
    }
    if (layout.abc.indexOf('z') < 0) throw new Error('empty measure should contain rest in ABC: ' + layout.abc)
  })
}

async function runBlockD(page, results) {
  await runScenario(results, 'Insert: normal select E → N → click between C–D', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 3) throw new Error('need at least 3 notes')
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(200)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 0 })
    await assertCaretIndex(page, 1, 'between C and D after selecting E')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'G', 'D', 'E', 'F'], 'G between C and D not at E index')
  })

  await runScenario(results, 'Insert: Esc after edit preserves new click caret', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, 'a')
    await sleep(300)
    await ensureNormalMode(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await assertCaretIndex(page, 2, 'between D and E after mode toggle')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'G', 'E', 'F', 'A'], 'G at clicked slot with A at end')
  })
}

async function runBlockDP1(page, results) {
  await runScenario(results, 'Insert: blur to body then click gap', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await page.click('body')
    await sleep(150)
    await clickStaffForNoteInput(page, { between: 1 })
    await assertCaretIndex(page, 2, 'between D and E after blur')
    await pressKey(page, 'g')
    await sleep(300)
    await assertNoteSteps(page, ['C', 'D', 'G', 'E', 'F'], 'G between D and E after blur')
  })
}

async function runBlockEP1(page, results) {
  await runScenario(results, 'Insert: voice1 edit then voice2 click', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)

    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true, voiceClass: 0 })
    await pressKey(page, 'a')
    await sleep(300)

    await ensureNormalMode(page)
    await clickStaffVoiceNote(page, 1, 0)
    await page.waitForFunction(function() {
      return window.__abc2bookNotationTest.getVoiceKey() === '2'
    }, { timeout: 5000 })
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true, voiceClass: 1 })
    const eventCount = await getEventCount(page)
    await assertCaretIndex(page, eventCount, 'voice 2 append caret')
    await pressKey(page, 'c')
    await sleep(300)
    await assertNoteSteps(page, ['G', 'B', 'D', 'C'], 'C appended in voice 2')

    await page.evaluate(function() {
      const btn = document.querySelector('[data-testid="notation-voices-manage"]')
      if (btn) btn.click()
    })
    await sleep(300)
    await page.evaluate(function() {
      const edit = document.querySelector('[data-testid="voices-manage-edit-1"]')
      if (edit) edit.click()
    })
    await sleep(400)
    await page.evaluate(function() {
      var closeBtn = document.querySelector('.modal.show .btn-close, .modal.show .btn-secondary')
      if (closeBtn) closeBtn.click()
    })
    await sleep(300)
    const voice1Abc = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getVoiceAbc()
    })
    if (voice1Abc.indexOf('A') < 0) {
      throw new Error('voice 1 should contain appended A, got: ' + voice1Abc)
    }
    await assertNoteSteps(page, ['C', 'E', 'G', 'A'], 'voice 1 has A appended, voice 2 edit isolated')
  })
}

async function runInsertPlacementTests(page, ctx) {
  const results = ctx.results
  const useResolverV2 = ctx.clickResolverV2 !== false

  if (useResolverV2) {
    await page.evaluate(function() {
      localStorage.setItem('notationClickResolverV2', '1')
    })
  }

  console.log('\n--- P0 insert placement: Block A (slot sweep) ---')
  await runBlockA(page, results)

  console.log('\n--- P0 insert placement: Block B (stale-caret) ---')
  await runBlockB(page, results)

  console.log('\n--- P0 insert placement: Block C (rest & layout) ---')
  await runBlockC(page, results)

  console.log('\n--- P0 insert placement: Block D (mode transitions) ---')
  await runBlockD(page, results)

  if (isP1Tier(ctx)) {
    console.log('\n--- P1 insert placement: Block C (range & empty measure) ---')
    await runBlockCP1(page, results)
    console.log('\n--- P1 insert placement: Block D (blur) ---')
    await runBlockDP1(page, results)
    console.log('\n--- P1 insert placement: Block E (voice isolation) ---')
    await runBlockEP1(page, results)
  }
}

module.exports = { runInsertPlacementTests }
