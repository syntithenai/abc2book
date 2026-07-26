'use strict'

const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  ensureNormalMode,
  getVoiceAbc,
  getNotationState,
  normalizeAbcBody,
  pressKey,
  clickTestId,
  dragStaffNoteByIndex,
  dragStaffNoteFarOffGlyph,
  staffNoteCenters,
  staffStepPixels,
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

  await runScenario(results, 'P0: large drag clamps octave — E up 5 stays neighborhood (not multi-octave leap)', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await pressKey(page, 'Escape')
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(150)
    await dragStaffNoteByIndex(page, 2, 5)
    // Clamp ±4: E4 → B4 max. Letter-only assert would green on multi-octave E→B leap.
    await assertEvents(page, ['note:C4', 'note:D4', 'note:B4', 'note:F4', 'bar:|'], 'drag E up 5 clamped to B4')
  })

  await runScenario(results, 'P0: off-glyph flick drag does not leap octave or vanish neighbors', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await pressKey(page, 'Escape')
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[2].x, centers[2].y)
    await sleep(150)
    await dragStaffNoteFarOffGlyph(page, 2)
    const events = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSessionEvents()
    })
    const notes = events.filter(function(ev) { return ev.type === 'note' })
    if (notes.length !== 4) throw new Error('expected 4 notes after off-glyph drag, got ' + notes.length)
    if (!notes[0].pitch || notes[0].pitch.step !== 'C' || notes[0].pitch.octave !== 4) {
      throw new Error('C neighbor must stay C4')
    }
    if (!notes[1].pitch || notes[1].pitch.step !== 'D' || notes[1].pitch.octave !== 4) {
      throw new Error('D neighbor must stay D4')
    }
    if (!notes[3].pitch || notes[3].pitch.step !== 'F' || notes[3].pitch.octave !== 4) {
      throw new Error('F neighbor must stay F4')
    }
    const eOct = notes[2].pitch && notes[2].pitch.octave
    if (eOct == null || eOct < 4 || eOct > 6) {
      throw new Error('dragged note must stay in octave neighborhood, got octave ' + eOct)
    }
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

  await runScenario(results, 'P0: ArrowLeft/Right move selection and stay on tune', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const urlBefore = page.url()
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 3) throw new Error('need notes for arrow nav')
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(150)
    await pressKey(page, 'ArrowRight')
    await sleep(200)
    const afterRight = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const sel = h.getSelection()
      const idx = events.findIndex(function(ev) { return sel.eventIds[0] === ev.id })
      const step = idx >= 0 && events[idx].pitch ? events[idx].pitch.step : null
      return {
        caret: h.getCaretIndex(),
        idx: idx,
        step: step,
        mode: h.getMode(),
      }
    })
    if (afterRight.step !== 'E') {
      throw new Error('ArrowRight from D should select E, got step=' + afterRight.step + ' idx=' + afterRight.idx)
    }
    if (afterRight.caret !== afterRight.idx) {
      throw new Error('caret should sync to selected E, caret=' + afterRight.caret + ' idx=' + afterRight.idx)
    }
    await pressKey(page, 'ArrowLeft')
    await sleep(200)
    const afterLeft = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const sel = h.getSelection()
      const idx = events.findIndex(function(ev) { return sel.eventIds[0] === ev.id })
      const step = idx >= 0 && events[idx].pitch ? events[idx].pitch.step : null
      return { caret: h.getCaretIndex(), idx: idx, step: step }
    })
    if (afterLeft.step !== 'D') {
      throw new Error('ArrowLeft from E should select D, got step=' + afterLeft.step)
    }
    const urlAfter = page.url()
    if (urlAfter !== urlBefore) {
      throw new Error('ArrowLeft/Right must not navigate tunes; before=' + urlBefore + ' after=' + urlAfter)
    }
    if (urlAfter.indexOf(BASIC_TUNE_ID) < 0) {
      throw new Error('should still be on basic fixture tune, url=' + urlAfter)
    }
  })

  await runScenario(results, 'P0: ArrowRight works after blur to body', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const urlBefore = page.url()
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 3) throw new Error('need notes for blur arrow nav')
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(150)
    await page.evaluate(function() {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
      document.body.setAttribute('tabindex', '-1')
      document.body.focus()
    })
    await sleep(100)
    await pressKey(page, 'ArrowRight')
    await sleep(200)
    const after = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const sel = h.getSelection()
      const idx = events.findIndex(function(ev) { return sel && sel.eventIds && sel.eventIds[0] === ev.id })
      return {
        step: idx >= 0 && events[idx].pitch ? events[idx].pitch.step : null,
        focusTag: document.activeElement && document.activeElement.tagName,
      }
    })
    if (after.step !== 'E') {
      throw new Error('ArrowRight after body blur should select E from D, got step=' + after.step)
    }
    if (page.url() !== urlBefore) {
      throw new Error('blur ArrowRight must not leave tune')
    }
  })

  await runScenario(results, 'P0: Shift+click selects contiguous range C→F', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 4) throw new Error('need 4 notes for Shift+click range')
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await page.keyboard.down('Shift')
    await page.mouse.click(centers[3].x, centers[3].y)
    await page.keyboard.up('Shift')
    await sleep(200)
    const sel = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const s = h.getSelection()
      const steps = (s.eventIds || []).map(function(id) {
        const ev = events.find(function(e) { return e.id === id })
        return ev && ev.pitch ? ev.pitch.step : (ev && ev.type)
      })
      return { count: (s.eventIds || []).length, steps: steps }
    })
    if (sel.count !== 4 || sel.steps.join('') !== 'CDEF') {
      throw new Error('Shift+click C→F should select CDEF, got ' + JSON.stringify(sel))
    }
  })

  await runScenario(results, 'P0: Ctrl+click toggles additive selection', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 3) throw new Error('need notes for Ctrl+click')
    await page.mouse.click(centers[0].x, centers[0].y)
    await sleep(150)
    await page.keyboard.down('Control')
    await page.mouse.click(centers[2].x, centers[2].y)
    await page.keyboard.up('Control')
    await sleep(200)
    const sel = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const s = h.getSelection()
      const steps = (s.eventIds || []).map(function(id) {
        const ev = events.find(function(e) { return e.id === id })
        return ev && ev.pitch ? ev.pitch.step : null
      }).filter(Boolean).sort()
      return { count: (s.eventIds || []).length, steps: steps }
    })
    if (sel.count !== 2 || sel.steps.join('') !== 'CE') {
      throw new Error('Ctrl+click should select C and E, got ' + JSON.stringify(sel))
    }
  })

  await runScenario(results, 'P0: Shift+ArrowRight extends selection', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[1].x, centers[1].y)
    await sleep(150)
    await pressKey(page, 'ArrowRight', { modifier: 'Shift' })
    await sleep(200)
    const sel = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const s = h.getSelection()
      const steps = (s.eventIds || []).map(function(id) {
        const ev = events.find(function(e) { return e.id === id })
        return ev && ev.pitch ? ev.pitch.step : (ev && ev.type)
      })
      return { count: (s.eventIds || []).length, steps: steps, anchorStep: (function() {
        const a = events.find(function(e) { return e.id === s.anchorId })
        return a && a.pitch ? a.pitch.step : null
      })() }
    })
    if (sel.count < 2 || sel.steps.indexOf('D') < 0 || sel.steps.indexOf('E') < 0) {
      throw new Error('Shift+ArrowRight from D should include D and E, got ' + JSON.stringify(sel))
    }
    if (sel.anchorStep !== 'D') {
      throw new Error('anchor should stay D, got ' + sel.anchorStep)
    }
  })

  await runScenario(results, 'P0: Shift+drag marquee selects notes', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    if (centers.length < 2) throw new Error('need notes for marquee')
    const startX = centers[0].x - 12
    const startY = centers[0].y + 48
    await page.keyboard.down('Shift')
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(centers[1].x + 18, centers[1].y - 20, { steps: 14 })
    await sleep(80)
    const mid = await page.evaluate(function() {
      return !!document.querySelector('[data-testid="notation-staff-marquee"]')
    })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await sleep(300)
    const sel = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const s = h.getSelection()
      const steps = (s.eventIds || []).map(function(id) {
        const ev = events.find(function(e) { return e.id === id })
        return ev && ev.pitch ? ev.pitch.step : null
      }).filter(Boolean)
      return { count: (s.eventIds || []).length, steps: steps, sawMarquee: !!document.querySelector('[data-testid="notation-staff-marquee"]') }
    })
    if (!mid) throw new Error('expected marquee overlay during drag')
    if (sel.count < 2 || sel.steps.indexOf('C') < 0 || sel.steps.indexOf('D') < 0) {
      throw new Error('marquee should select at least C and D, got ' + JSON.stringify(sel))
    }
  })

  await runScenario(results, 'P0: double-click selects whole measure', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    await page.mouse.click(centers[1].x, centers[1].y, { clickCount: 2 })
    await sleep(250)
    const sel = await page.evaluate(function() {
      const h = window.__abc2bookNotationTest
      const events = h.getSessionEvents()
      const s = h.getSelection()
      const kinds = (s.eventIds || []).map(function(id) {
        const ev = events.find(function(e) { return e.id === id })
        if (!ev) return null
        if (ev.type === 'barline') return 'bar'
        return ev.pitch ? ev.pitch.step : ev.type
      })
      return { count: (s.eventIds || []).length, kinds: kinds }
    })
    if (sel.count < 5 || sel.kinds.join(',') !== 'C,D,E,F,bar') {
      throw new Error('double-click measure should select CDEF+bar, got ' + JSON.stringify(sel))
    }
  })

  await runScenario(results, 'P0: pitch drag shows live preview then commits', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNormalMode(page)
    const centers = await staffNoteCenters(page, 0)
    const stepPx = await staffStepPixels(page)
    const pt = centers[1]
    // Select first so selection boxes exist; then drag for live preview translate.
    await page.mouse.click(pt.x, pt.y)
    await sleep(150)
    await page.mouse.move(pt.x, pt.y)
    await page.mouse.down()
    // Match dragStaffNoteByIndex bias so resolveDragStaffSteps lands on exactly 1 step.
    await page.mouse.move(pt.x, pt.y - ((1 + 0.45) * stepPx), { steps: 10 })
    await sleep(100)
    const mid = await page.evaluate(function() {
      const target = document.querySelector('[data-testid="notation-staff-pitch-target"]')
      return { hasPreview: !!target }
    })
    await page.mouse.up()
    await sleep(400)
    if (!mid.hasPreview) throw new Error('expected pitch-target notehead during vertical pitch drag')
    await assertNoteSteps(page, ['C', 'E', 'E', 'F'], 'drag D up one staff step → E')
  })

  await runScenario(results, 'P0: note input ArrowRight moves caret without leaving tune', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    const urlBefore = page.url()
    await clickStaffForNoteInput(page, { between: 1 })
    const caretBetween = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getCaretIndex()
    })
    await pressKey(page, 'ArrowRight')
    await sleep(150)
    const caretAfter = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getCaretIndex()
    })
    if (caretAfter !== caretBetween + 1) {
      throw new Error('note input ArrowRight should advance caret, before=' + caretBetween + ' after=' + caretAfter)
    }
    if (page.url() !== urlBefore) {
      throw new Error('note input arrows must not navigate tunes')
    }
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
    await assertEvents(page, ['note:D4', 'note:E4', 'note:F4', 'bar:|'], 'Ctrl+Delete removes C event entirely')
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
    await assertEvents(page, ['note:C4', 'note:D4', 'rest:1', 'note:F4', 'bar:|'], 'Backspace rests selected E')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    const centers2 = await staffNoteCenters(page, 0)
    await page.mouse.click(centers2[2].x, centers2[2].y)
    await sleep(150)
    await pressKey(page, 'Delete')
    await sleep(200)
    await assertNoteSteps(page, ['C', 'D', 'F'], 'Delete with E selected rests E')
    await assertEvents(page, ['note:C4', 'note:D4', 'rest:1', 'note:F4', 'bar:|'], 'Delete rests selected E')
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
    await assertEvents(page, ['note:C4', 'note:D4', 'note:E4', 'rest:1', 'bar:|'], 'F becomes rest')
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
    await assertEvents(page, ['note:C4', 'note:D4', 'rest:2', 'note:E4', 'note:F4', 'bar:|'], '0 key inserts rest at caret')

    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 2 })
    const pt = (await staffNoteCenters(page, 0))[2]
    await page.mouse.click(pt.x + 30, pt.y, { button: 'right' })
    await sleep(300)
    await assertEvents(page, ['note:C4', 'note:D4', 'note:E4', 'rest:2', 'note:F4', 'bar:|'], 'right-click inserts rest at caret')
  })

  await runScenario(results, 'P0: barline button inserts | at caret between D and E', async function() {
    await resetNotationFixture(page, BASIC_TUNE_ID)
    await focusNotationEditor(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    await assertVoiceAbc(page, 'C D | E F |', 'barline between D and E')
    await assertEvents(page, ['note:C4', 'note:D4', 'bar:|', 'note:E4', 'note:F4', 'bar:|'], 'barline event at caret 2')
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
