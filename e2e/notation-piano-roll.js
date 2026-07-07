'use strict'

const {
  runScenario,
  focusNotationEditor,
  getNotationState,
  pressKey,
  clickTestId,
  sleep,
  resetNotationFixture,
  goToEditorHash,
} = require('./helpers')

const BASIC_TUNE_ID = 'e2e00000000000000000001'

async function gotoPianoRoll(page) {
  await resetNotationFixture(page, BASIC_TUNE_ID)
  await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/pianoRoll')
  await sleep(400)
  await focusNotationEditor(page)
}

async function runPianoRollTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P2: piano roll view loads canvas and tools', async function() {
    await gotoPianoRoll(page)
    await page.waitForSelector('[data-testid="piano-roll-canvas"]', { timeout: 15000 })
    await page.waitForSelector('[data-testid="piano-roll-tool-draw"]', { visible: true })
  })

  await runScenario(results, 'P2: Draw tool inserts note', async function() {
    await gotoPianoRoll(page)
    await focusNotationEditor(page)
    await clickTestId(page, 'piano-roll-tool-draw')
    const box = await page.$eval('[data-testid="piano-roll-canvas"]', function(el) {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.45 }
    })
    await page.mouse.click(box.x, box.y)
    await sleep(400)
    const added = await page.evaluate(function() {
      const events = window.__abc2bookNotationTest.getSessionEvents()
      const notes = events.filter(function(ev) { return ev.type === 'note' || ev.type === 'chord' })
      const last = notes[notes.length - 1]
      return {
        count: notes.length,
        step: last && last.pitch ? last.pitch.step : null,
        startBeat: last && last.startBeat,
      }
    })
    if (added.count < 5) throw new Error('Draw should add a 5th note, got count ' + added.count)
    if (!added.step) throw new Error('drawn note should have pitch')
    if (typeof added.startBeat !== 'number' || added.startBeat < 0) {
      throw new Error('drawn note should have startBeat, got ' + added.startBeat)
    }
  })

  await runScenario(results, 'P2: Snap toggle changes snapEnabled', async function() {
    await gotoPianoRoll(page)
    await page.waitForSelector('[data-testid="piano-roll-snap"]', { visible: true, timeout: 15000 })
    const before = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSnapEnabled()
    })
    await clickTestId(page, 'piano-roll-snap')
    await sleep(150)
    const after = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSnapEnabled()
    })
    if (before === after) throw new Error('snap toggle should flip snapEnabled')
    await clickTestId(page, 'piano-roll-snap')
    await sleep(150)
    const restored = await page.evaluate(function() {
      return window.__abc2bookNotationTest.getSnapEnabled()
    })
    if (restored !== before) throw new Error('second snap toggle should restore initial snapEnabled')
  })

  await runScenario(results, 'P2: quantize button opens dialog', async function() {
    await gotoPianoRoll(page)
    await clickTestId(page, 'piano-roll-quantize')
    await page.waitForSelector('.modal.show, .quantize-dialog', { timeout: 5000 })
    await pressKey(page, 'Escape')
  })

  await runScenario(results, 'P2: arrow nudge in piano roll focus', async function() {
    await gotoPianoRoll(page)
    await clickTestId(page, 'piano-roll-tool-select')
    const selected = await page.evaluate(function() {
      return window.__abc2bookNotationTest.selectNoteByStep('C')
    })
    if (!selected) throw new Error('could not select C for nudge test')
    await page.evaluate(function() {
      var ws = document.querySelector('.piano-roll-workspace')
      if (ws) ws.focus()
    })
    await sleep(150)
    const before = await page.evaluate(function() {
      const selId = window.__abc2bookNotationTest.getSelection().eventIds[0]
      const ev = window.__abc2bookNotationTest.getSessionEvents().find(function(e) { return e.id === selId })
      if (!ev || !ev.pitch) return null
      const p = ev.pitch
      const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
      return (p.octave + 1) * 12 + (steps[p.step] || 0) + (p.accidental || 0)
    })
    await pressKey(page, 'ArrowUp')
    await sleep(200)
    const after = await page.evaluate(function() {
      const selId = window.__abc2bookNotationTest.getSelection().eventIds[0]
      const ev = window.__abc2bookNotationTest.getSessionEvents().find(function(e) { return e.id === selId })
      if (!ev || !ev.pitch) return null
      const p = ev.pitch
      const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
      return (p.octave + 1) * 12 + (steps[p.step] || 0) + (p.accidental || 0)
    })
    if (before == null || after == null) throw new Error('selected note not found for nudge')
    if (after !== before + 1) throw new Error('ArrowUp should raise pitch by 1 semitone, before=' + before + ' after=' + after)
  })
}

module.exports = { runPianoRollTests }
