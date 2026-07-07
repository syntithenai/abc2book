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

async function selectVoiceByKey(page, voiceKey) {
  await page.waitForSelector('[data-testid="notation-voices-menu"]', { visible: true })
  await page.click('[data-testid="notation-voices-menu"]')
  await sleep(300)
  await page.evaluate(function(key) {
    var input = document.querySelector('[data-testid="notation-voice-tab-' + key + '"] .notation-voice-name-input')
    if (input) {
      input.focus()
      input.click()
    }
  }, voiceKey)
  await sleep(600)
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
    await assertNoteSteps(page, ['G', 'B', 'C', 'D'], 'note added in voice 2')

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
    await page.click('[data-testid="notation-voices-menu"]')
    await sleep(300)
    const checkBtn = await page.$('[data-testid="notation-voice-tab-2"] .notation-voice-check-btn')
    if (!checkBtn) throw new Error('voice 2 visibility checkbox not found')
    await checkBtn.click()
    await sleep(400)
    await pressKey(page, 'Escape')
    await sleep(200)
    const after = await page.evaluate(function() {
      return document.querySelectorAll('.abcjs-note').length
    })
    if (after >= before && before > 0) {
      throw new Error('hiding voice 2 should reduce rendered note count')
    }
  })

  await runScenario(results, 'P1: add voice creates new tab', async function() {
    await resetNotationFixture(page, TWO_VOICE_TUNE_ID)
    await focusNotationEditor(page)
    await page.click('[data-testid="notation-voices-menu"]')
    await sleep(300)
    await page.evaluate(function() {
      var btn = document.querySelector('.notation-voice-add-btn')
      if (btn) btn.click()
    })
    await sleep(500)
    const tabs = await page.$$('[data-testid^="notation-voice-tab-"]')
    if (tabs.length < 3) throw new Error('add voice should create a third voice tab')
    await selectVoiceByKey(page, '1')
    await assertNoteSteps(page, ['C', 'E', 'G'], 'voice 1 unchanged after add')
  })
}

module.exports = { runVoiceTests }
