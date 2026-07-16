'use strict'

const {
  runScenario,
  focusNotationEditor,
  ensureNoteInputMode,
  pressKey,
  sleep,
  resetNotationFixture,
  clickStaffForNoteInput,
} = require('./helpers')
const { assertNoteSteps, collapseAbcWhitespace } = require('./notation-assertions')

const TWO_VOICE_TUNE_ID = 'e2e00000000000000000002'

async function openVoicesManage(page) {
  await page.waitForSelector('[data-testid="notation-voices-manage"]', { visible: true })
  await page.click('[data-testid="notation-voices-manage"]')
  await page.waitForSelector('.voices-manage-modal.show, .modal.show .voices-manage-modal, .modal.show', {
    visible: true,
  })
  await sleep(300)
}

async function selectVoiceByKey(page, voiceKey) {
  await openVoicesManage(page)
  await page.waitForSelector('[data-testid="voices-manage-edit-' + voiceKey + '"]', { visible: true })
  await page.click('[data-testid="voices-manage-edit-' + voiceKey + '"]')
  await sleep(400)
  await page.evaluate(function() {
    var closeBtn = document.querySelector('.modal.show .btn-close, .modal.show .btn-secondary')
    if (closeBtn) closeBtn.click()
  })
  await sleep(400)
}

async function runVoiceTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P1: switch voice updates active voice ABC', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)
    let abc = await page.evaluate(function() { return window.__abc2bookNotationTest.getVoiceAbc() })
    if (abc.indexOf('C') < 0 || abc.indexOf('E') < 0) {
      throw new Error('voice 1 should contain C E G, got: ' + abc)
    }

    await selectVoiceByKey(page, '2')
    const voiceKey = await page.evaluate(function() { return window.__abc2bookNotationTest.getVoiceKey() })
    if (voiceKey !== '2') throw new Error('expected active voice 2, got ' + voiceKey)
    abc = await page.evaluate(function() { return window.__abc2bookNotationTest.getVoiceAbc() })
    if (abc.indexOf('G,') < 0 || abc.indexOf('B,') < 0) {
      throw new Error('voice 2 should contain G, B, D, got: ' + abc)
    }
  })

  await runScenario(results, 'P1: edit voice 2 does not change voice 1', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)
    await selectVoiceByKey(page, '1')
    const voice1Abc = await page.evaluate(function() { return window.__abc2bookNotationTest.getVoiceAbc() })
    if (collapseAbcWhitespace(voice1Abc).indexOf('C') < 0) {
      throw new Error('voice 1 baseline should contain C E G, got: ' + voice1Abc)
    }

    await selectVoiceByKey(page, '2')
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { atEnd: true })
    await pressKey(page, 'c')
    await sleep(300)
    await assertNoteSteps(page, ['G', 'B', 'D', 'C'], 'note added in voice 2')

    await selectVoiceByKey(page, '1')
    await page.waitForFunction(function() {
      return window.__abc2bookNotationTest.getVoiceKey() === '1'
    }, { timeout: 5000 })
    const voice1After = await page.evaluate(function() { return window.__abc2bookNotationTest.getVoiceAbc() })
    if (collapseAbcWhitespace(voice1After) !== collapseAbcWhitespace(voice1Abc)) {
      throw new Error('voice 1 ABC changed when editing voice 2: before="' + voice1Abc + '" after="' + voice1After + '"')
    }
    await assertNoteSteps(page, ['C', 'E', 'G'], 'voice 1 pitches unchanged')
  })

  await runScenario(results, 'P1: voice visibility checkbox toggles displayed voices', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)
    const before = await page.evaluate(function() {
      return document.querySelectorAll('.abcjs-note').length
    })
    await openVoicesManage(page)
    const check = await page.$('[data-testid="voices-manage-visible-2"]')
    if (!check) throw new Error('voice 2 visibility checkbox not found')
    await check.click()
    await sleep(400)
    await page.evaluate(function() {
      var closeBtn = document.querySelector('.modal.show .btn-close, .modal.show .btn-secondary')
      if (closeBtn) closeBtn.click()
    })
    await sleep(400)
    const after = await page.evaluate(function() {
      return document.querySelectorAll('.abcjs-note').length
    })
    if (after >= before && before > 0) {
      throw new Error('hiding voice 2 should reduce rendered note count')
    }
  })

  await runScenario(results, 'P1: add voice creates new row', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)
    await openVoicesManage(page)
    await page.click('[data-testid="voices-manage-add"]')
    await sleep(500)
    const rows = await page.$$('[data-testid^="voices-manage-row-"]')
    if (rows.length < 3) throw new Error('add voice should create a third voice row')
    await page.evaluate(function() {
      var closeBtn = document.querySelector('.modal.show .btn-close, .modal.show .btn-secondary')
      if (closeBtn) closeBtn.click()
    })
    await sleep(400)
    await selectVoiceByKey(page, '1')
    await assertNoteSteps(page, ['C', 'E', 'G'], 'voice 1 unchanged after add')
  })
}

module.exports = { runVoiceTests }
