#!/usr/bin/env node
/**
 * Download MusyngKite per-note MP3 packs (+ .js where available) into the
 * embedded selection bank at midi-js-soundfonts/selection/MusyngKite/.
 *
 * Usage: node scripts/fetch-selection-soundfonts.js
 *        node scripts/fetch-selection-soundfonts.js --instrument cello
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SOURCE_BASE = 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite';
const TARGET_DIR = path.join(__dirname, '..', 'midi-js-soundfonts', 'selection', 'MusyngKite');

const NOTE_NAMES = [
  'A0', 'Bb0', 'B0',
  'C1', 'Db1', 'D1', 'Eb1', 'E1', 'F1', 'Gb1', 'G1', 'Ab1', 'A1', 'Bb1', 'B1',
  'C2', 'Db2', 'D2', 'Eb2', 'E2', 'F2', 'Gb2', 'G2', 'Ab2', 'A2', 'Bb2', 'B2',
  'C3', 'Db3', 'D3', 'Eb3', 'E3', 'F3', 'Gb3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3',
  'C4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'Gb4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4',
  'C5', 'Db5', 'D5', 'Eb5', 'E5', 'F5', 'Gb5', 'G5', 'Ab5', 'A5', 'Bb5', 'B5',
  'C6', 'Db6', 'D6', 'Eb6', 'E6', 'F6', 'Gb6', 'G6', 'Ab6', 'A6', 'Bb6', 'B6',
  'C7', 'Db7', 'D7', 'Eb7', 'E7', 'F7', 'Gb7', 'G7', 'Ab7', 'A7', 'Bb7', 'B7',
  'C8',
];

/** Instruments to ensure in the selection bank (fill + melody). */
const SELECTION_INSTRUMENTS = [
  'accordion',
  'acoustic_grand_piano',
  'acoustic_guitar_nylon',
  'acoustic_guitar_steel',
  'acoustic_bass',
  'brass_section',
  'cello',
  'choir_aahs',
  'fiddle',
  'flute',
  'harmonica',
  'orchestral_harp',
  'pizzicato_strings',
  'slap_bass_1',
  'string_ensemble_1',
  'violin',
];

function fetchUrl(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect without location: ' + url));
        return resolve(fetchUrl(loc.startsWith('http') ? loc : new URL(loc, url).href));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath)) return false;
  const data = await fetchUrl(url);
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, data);
  return true;
}

async function downloadInstrument(instrument) {
  const noteDir = path.join(TARGET_DIR, instrument + '-mp3');
  ensureDir(noteDir);
  let downloaded = 0;
  for (let i = 0; i < NOTE_NAMES.length; i += 1) {
    const note = NOTE_NAMES[i];
    const url = SOURCE_BASE + '/' + instrument + '-mp3/' + note + '.mp3';
    const dest = path.join(noteDir, note + '.mp3');
    try {
      if (await downloadFile(url, dest)) downloaded += 1;
    } catch (err) {
      console.warn('  skip note', instrument, note, err.message);
    }
  }
  const jsUrl = SOURCE_BASE + '/' + instrument + '-mp3.js';
  const jsDest = path.join(TARGET_DIR, instrument + '-mp3.js');
  try {
    if (await downloadFile(jsUrl, jsDest)) downloaded += 1;
  } catch (err) {
    console.warn('  no js pack for', instrument, err.message);
  }
  console.log(instrument + ': ' + downloaded + ' new file(s)');
}

async function main() {
  const filterArg = process.argv.indexOf('--instrument');
  const only = filterArg >= 0 ? process.argv[filterArg + 1] : null;
  const instruments = only
    ? SELECTION_INSTRUMENTS.filter(function(name) { return name === only; })
    : SELECTION_INSTRUMENTS.filter(function(name) {
      const noteDir = path.join(TARGET_DIR, name + '-mp3');
      return !fs.existsSync(noteDir);
    });

  if (!instruments.length) {
    console.log('All selection instruments already present under', TARGET_DIR);
    return;
  }

  ensureDir(TARGET_DIR);
  console.log('Downloading', instruments.length, 'instrument(s) to', TARGET_DIR);
  for (let i = 0; i < instruments.length; i += 1) {
    await downloadInstrument(instruments[i]);
  }
  console.log('Done.');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
