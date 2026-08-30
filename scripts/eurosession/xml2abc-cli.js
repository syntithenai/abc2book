#!/usr/bin/env node
/** Convert MusicXML to ABC via headless Chrome + xml2abc-review.js (needs jQuery). */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const SCRIPT_DIR = __dirname;
const HTML_PATH = path.join(SCRIPT_DIR, 'xml2abc-cli.html');

async function convertXmlToAbc(xmlText, title) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + HTML_PATH);
    await page.waitForFunction('typeof window.vertaal === "function"');
    const abc = await page.evaluate(
      function(xml, fileTitle) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('MusicXML parse failed');
        const options = {
          u: 0, b: 4, n: 0, c: 0, v: 0, d: 0, m: 1, x: 0, t: 0,
          v1: 0, noped: 0, stm: 0, p: 'f', s: 0, addstavenum: 0, rehparts: 0, addq: 0, q: 100, mnum: -1,
        };
        const result = window.vertaal(doc, options);
        let text = result && result[0] ? String(result[0]) : '';
        if (!text.trim()) throw new Error('MusicXML conversion produced no ABC');
        if (fileTitle) {
          text = text.replace(/T:Title\b/g, 'T:' + fileTitle);
          text = text.replace(/Music21 Fragment/g, fileTitle).replace(/Music21/g, '');
        }
        return text.trim();
      },
      xmlText,
      title || ''
    );
    return abc;
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let title = '';
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--title') title = argv[++i] || '';
    else if (argv[i] === '-h' || argv[i] === '--help') {
      process.stderr.write('Usage: node xml2abc-cli.js [--title NAME] <score.xml>\n');
      process.exit(2);
    } else paths.push(argv[i]);
  }
  if (!paths.length) {
    process.stderr.write('Usage: node xml2abc-cli.js [--title NAME] <score.xml>\n');
    process.exit(2);
  }
  const xmlText = fs.readFileSync(paths[0], 'utf8');
  const abc = await convertXmlToAbc(xmlText, title);
  process.stdout.write(abc + '\n');
}

if (require.main === module) {
  main().catch(function(err) {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  });
}

module.exports = { convertXmlToAbc };
