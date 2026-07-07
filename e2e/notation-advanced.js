'use strict'

const {
  runScenario,
  focusNotationEditor,
  getVoiceAbc,
  pressKey,
  clickTestId,
  sleep,
  resetNotationFixture,
  goToEditorHash,
  ensureNoteInputMode,
  clickStaffForNoteInput,
} = require('./helpers')
const { assertVoiceAbc } = require('./notation-assertions')

const BASIC_TUNE_ID = 'e2e00000000000000000001'

async function gotoAbcView(page) {
  await resetNotationFixture(page, BASIC_TUNE_ID)
  await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/notationAbc')
  await sleep(400)
}

async function gotoMusic(page) {
  await resetNotationFixture(page, BASIC_TUNE_ID)
  await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/music')
  await sleep(400)
  await focusNotationEditor(page)
}

async function pressCtrlAltP(page) {
  await page.keyboard.down('Control')
  await page.keyboard.down('Alt')
  await page.keyboard.press('KeyP')
  await page.keyboard.up('Alt')
  await page.keyboard.up('Control')
  await sleep(300)
}

async function runAdvancedTests(page, ctx) {
  const results = ctx.results

  await runScenario(results, 'P3: ABC view textarea and preview', async function() {
    await gotoAbcView(page)
    await page.waitForSelector('[data-testid="notation-abc-textarea"]', { timeout: 15000 })
    await page.waitForSelector('[data-testid="notation-abc-preview"]', { timeout: 15000 })
    const before = await page.$eval('[data-testid="notation-abc-textarea"]', function(el) { return el.value })
    await page.focus('[data-testid="notation-abc-textarea"]')
    await page.keyboard.type(' z')
    await sleep(400)
    const abc = await getVoiceAbc(page)
    if (!abc || abc === before) throw new Error('ABC edit did not update voice body')
    if (abc.indexOf('z') < 0 && abc.indexOf('Z') < 0) throw new Error('typed rest should appear in voice ABC')
  })

  await runScenario(results, 'P3: split view via Ctrl+Alt+P cycle', async function() {
    await gotoMusic(page)
    await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/pianoRoll')
    await sleep(400)
    await focusNotationEditor(page)
    let view = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (view !== 'pianoRoll') throw new Error('expected pianoRoll route view, got ' + view)
    await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/music')
    await sleep(400)
    await focusNotationEditor(page)
    view = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (view !== 'staff') throw new Error('expected staff on music route, got ' + view)
  })

  await runScenario(results, 'P3: header undo restores ABC after edit', async function() {
    await gotoMusic(page)
    const before = await getVoiceAbc(page)
    await ensureNoteInputMode(page)
    await clickStaffForNoteInput(page, { between: 1 })
    await clickTestId(page, 'notation-barline')
    await sleep(300)
    const edited = await getVoiceAbc(page)
    if (edited === before) throw new Error('barline edit did not change ABC')
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await sleep(600)
    await assertVoiceAbc(page, before.replace(/\s+/g, ' ').trim(), 'undo restores pre-edit ABC')
  })

  await runScenario(results, 'P3: editor routes switch notation views', async function() {
    await gotoMusic(page)
    const staffView = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (staffView !== 'staff') throw new Error('expected staff on /music, got ' + staffView)

    await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/pianoRoll')
    await sleep(400)
    await focusNotationEditor(page)
    const rollView = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (rollView !== 'pianoRoll') throw new Error('expected pianoRoll route, got ' + rollView)

    await goToEditorHash(page, '#/editor/' + BASIC_TUNE_ID + '/notationAbc')
    await sleep(400)
    const abcView = await page.evaluate(function() { return window.__abc2bookNotationTest.getView() })
    if (abcView !== 'abc') throw new Error('expected abc view on notationAbc route, got ' + abcView)
  })
}

module.exports = { runAdvancedTests }
