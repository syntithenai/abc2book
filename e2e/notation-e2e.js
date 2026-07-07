#!/usr/bin/env node
/**
 * Notation editor E2E tests (scope-driven — see e2e/NOTATION.md).
 *
 * Prerequisites:
 *   npm start
 *
 * Usage:
 *   npm run test:notation:e2e              # P0 staff core
 *   NOTATION_E2E_TIER=1 npm run test:notation:e2e   # P0 + P1
 *   NOTATION_E2E_TIER=full npm run test:notation:e2e  # all tiers
 */
'use strict'

const {
  BASE,
  TIMEOUT_MS,
  launchBrowser,
  saveDebugScreenshot,
  waitForServer,
  navigateToNotationEditor,
  dismissBlockingDialogs,
  patchPageCompat,
} = require('./helpers')
const { editorMusicUrl, NOTATION_E2E_TUNE_ID, NOTATION_E2E_TWO_VOICE_ID } = require('./notation-fixtures')
const { runStaffWorkflowTests } = require('./notation-staff-workflow')
const { runStaffCoreTests } = require('./notation-staff-core')
const { runStaffFullTests } = require('./notation-staff-full')
const { runStaffMarksTests } = require('./notation-staff-marks')
const { runVoiceTests } = require('./notation-voices')
const { runPianoRollTests } = require('./notation-piano-roll')
const { runAdvancedTests } = require('./notation-advanced')

const TIER = process.env.NOTATION_E2E_TIER || '0'
const BASIC_URL = process.env.NOTATION_TEST_URL || editorMusicUrl(BASE, NOTATION_E2E_TUNE_ID)
const TWO_VOICE_URL = editorMusicUrl(BASE, NOTATION_E2E_TWO_VOICE_ID)

const results = []

async function main() {
  console.log('Notation E2E tests')
  console.log(' URL:', BASIC_URL)
  console.log(' Tier:', TIER)

  if (!(await waitForServer(BASIC_URL))) {
    console.error('\nDev server not reachable at', BASE)
    console.error('Start it with: npm start')
    process.exit(1)
  }

  let browser
  let page
  try {
    browser = await launchBrowser()
    page = await browser.newPage()
    patchPageCompat(page)
    page.setDefaultTimeout(TIMEOUT_MS)

    const ctx = {
      results: results,
      basicEditorUrl: BASIC_URL,
      twoVoiceEditorUrl: TWO_VOICE_URL,
      timeoutMs: TIMEOUT_MS,
      waitForReady: async function(p) {
        await dismissBlockingDialogs(p, 60000)
        await p.waitForFunction(function() {
          return window.__abc2bookNotationTest
            && typeof window.__abc2bookNotationTest.getVoiceAbc === 'function'
        }, { timeout: 60000 })
        await p.waitForSelector('[data-testid="notation-editor"]', { timeout: 30000 })
      },
    }

    await navigateToNotationEditor(page, BASIC_URL)

    console.log('\n--- P0 staff workflow ---')
    await runStaffWorkflowTests(page, ctx)

    console.log('\n--- P0 staff core ---')
    await runStaffCoreTests(page, ctx)

    if (TIER === '1' || TIER === 'full' || TIER === 'p1') {
      console.log('\n--- P1 staff full ---')
      await runStaffFullTests(page, ctx)
      console.log('\n--- P1 staff marks ---')
      await runStaffMarksTests(page, ctx)
      console.log('\n--- P1 voices ---')
      await runVoiceTests(page, ctx)
    }

    if (TIER === 'full' || TIER === 'p2') {
      console.log('\n--- P2 piano roll ---')
      await runPianoRollTests(page, ctx)
    }

    if (TIER === 'full' || TIER === 'p3') {
      console.log('\n--- P3 advanced ---')
      await runAdvancedTests(page, ctx)
    }

  } catch (err) {
    if (page) await saveDebugScreenshot(page, 'notation-fatal')
    console.error('\nFatal:', err.message || err)
    process.exit(1)
  } finally {
    if (page) await page.close().catch(function() {})
    if (browser) {
      if (process.env.NOTATION_TEST_CDP_URL || process.env.PLAYBACK_TEST_CDP_URL) {
        browser.disconnect()
      } else {
        await browser.close()
      }
    }
  }

  const failed = results.filter(function(r) { return r.ok === false })
  const skipped = results.filter(function(r) { return r.ok == null })
  const passed = results.filter(function(r) { return r.ok === true })

  console.log('\n--- Summary ---')
  console.log('Passed:', passed.length, 'Failed:', failed.length, 'Skipped:', skipped.length)

  if (failed.length) {
    failed.forEach(function(r) {
      console.error(' -', r.name, ':', r.error)
    })
    process.exit(1)
  }
  console.log('\nAll notation E2E scenarios passed.')
}

main()
