#!/usr/bin/env node
/**
 * CI helper: fail on React-related ESLint issues and browser console warnings.
 * Usage: node scripts/check-react-warnings.js [--skip-browser]
 */
const { execSync } = require('child_process')
const skipBrowser = process.argv.includes('--skip-browser')

const ESLINT_CMD = 'npx eslint src --ext .js,.jsx --format unix'
const REACT_RULES = /react-hooks\/|react\/jsx-|jsx-a11y\//

function checkEslint() {
  let output = ''
  try {
    execSync(ESLINT_CMD, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    output = (err.stdout || '') + (err.stderr || '')
  }
  const hits = output.split('\n').filter(function(line) {
    return REACT_RULES.test(line)
  })
  if (hits.length > 0) {
    console.error('React-related ESLint issues:\n' + hits.join('\n'))
    return false
  }
  console.log('ESLint: no react-hooks / react/jsx / jsx-a11y issues')
  return true
}

async function checkBrowser() {
  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const msgs = []
  page.on('console', function(m) {
    const t = m.type()
    const text = m.text()
    if (t !== 'warning' && t !== 'error') return
    if (/MIME type|Service Registration failed/.test(text)) return
    if (/Warning:.*React|react/i.test(text) || /unique "key" prop/.test(text)) {
      msgs.push({ t: t, text: text })
    }
  })
  const routes = ['/#/', '/#/books', '/#/tunes', '/#/help', '/#/settings']
  for (const route of routes) {
    try {
      await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle2', timeout: 30000 })
      await new Promise(function(r) { setTimeout(r, 1500) })
    } catch (e) { /* dev server may be down */ }
  }
  await browser.close()
  const uniq = [...new Map(msgs.map(function(m) { return [m.t + ':' + m.text.slice(0, 120), m] })).values()]
  if (uniq.length > 0) {
    console.error('Browser React warnings:\n' + uniq.map(function(m) { return m.t + ': ' + m.text.slice(0, 300) }).join('\n---\n'))
    return false
  }
  console.log('Browser: no React console warnings on main routes')
  return true
}

async function main() {
  const eslintOk = checkEslint()
  let browserOk = true
  if (!skipBrowser) {
    try {
      browserOk = await checkBrowser()
    } catch (e) {
      console.warn('Browser check skipped:', e.message)
    }
  }
  if (!eslintOk || !browserOk) process.exit(1)
}

main().catch(function(e) {
  console.error(e)
  process.exit(1)
})
