#!/usr/bin/env node
'use strict'
const puppeteer = require('puppeteer')

async function main() {
  const browser = await puppeteer.connect({ browserURL: process.env.PLAYBACK_TEST_CDP_URL || 'http://127.0.0.1:9222' })
  const page = await browser.newPage()
  await page.goto('http://localhost:3000/#/tunes/62828a3a7e0d5d8ba323b83c/playMedia/0', { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForFunction(function() { return window.__abc2bookPlaybackTest })
  const g = function() { return page.evaluate(function() { return window.__abc2bookPlaybackTest.getProgress() }) }
  const play = await page.$('[data-testid="media-play-button"]')
  if (play) await play.click()
  await page.waitForTimeout(3000)
  console.log('playing', await g())
  await page.evaluate(function() { window.__abc2bookPlaybackTest.seek(0.5) })
  await page.waitForTimeout(500)
  console.log('seek 0.5', await g())
  await page.click('[data-testid="media-pause-button"]')
  await page.waitForTimeout(500)
  console.log('paused', await g())
  await page.click('[data-testid="media-play-button"]')
  await page.waitForTimeout(2000)
  console.log('resumed', await g())
  await page.waitForTimeout(2000)
  console.log('resumed+2s', await g())
  console.log('seek 0.35', await page.evaluate(function() { return window.__abc2bookPlaybackTest.seekAndReport(0.35) }))
  await page.waitForTimeout(2000)
  console.log('seek+2s', await g())
  await page.close()
  browser.disconnect()
}

main().catch(function(e) { console.error(e); process.exit(1) })
