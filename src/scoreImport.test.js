import fs from 'fs';
import path from 'path';
import {
  checkForMissingXmlHeader,
  extractMusicXmlFromMxl,
  isMusicXmlText,
} from './mxlExtract';
import { musicXmlToAbc } from './musicXmlToAbc';
import { detectScoreFormat } from './scoreImportClient';
import { MINIMAL_MUSICXML } from './__fixtures__/musicXmlSamples';

describe('mxlExtract', function() {
  test('isMusicXmlText detects xml and score-partwise', function() {
    expect(isMusicXmlText('<?xml version="1.0"?><score-partwise></score-partwise>')).toBe(true);
    expect(isMusicXmlText('plain text')).toBe(false);
  });

  test('checkForMissingXmlHeader prepends declaration when needed', function() {
    const input = '<score-partwise version="3.1"><part-list></part-list></score-partwise>';
    const output = checkForMissingXmlHeader(input);
    expect(output.indexOf('<?xml version="1.0"')).toBe(0);
    expect(output.indexOf('<!DOCTYPE score-partwise')).toBeGreaterThan(0);
  });

  test('extractMusicXmlFromMxl reads container root path', async function() {
    const fixturePath = path.join(__dirname, '__fixtures__', 'sample.mxl');
    const bytes = new Uint8Array(fs.readFileSync(fixturePath));
    const musicXml = await extractMusicXmlFromMxl(bytes.buffer);
    expect(isMusicXmlText(musicXml)).toBe(true);
    expect(musicXml.indexOf('<step>C</step>')).toBeGreaterThan(-1);
  });
});

describe('musicXmlToAbc', function() {
  test('converts minimal MusicXML to ABC', function() {
    const abc = musicXmlToAbc(MINIMAL_MUSICXML, { fileName: 'hello-world.xml' });
    expect(abc.indexOf('X:')).toBeGreaterThan(-1);
    expect(abc.indexOf('M:4/4')).toBeGreaterThan(-1);
  });

  test('rejects empty input', function() {
    expect(function() { musicXmlToAbc(''); }).toThrow('empty');
  });

  test('rejects invalid xml', function() {
    expect(function() { musicXmlToAbc('<not-xml'); }).toThrow();
  });
});

describe('scoreImportClient', function() {
  test('detectScoreFormat maps extensions', function() {
    expect(detectScoreFormat('tune.mxl')).toBe('mxl');
    expect(detectScoreFormat('tune.musicxml')).toBe('musicxml');
    expect(detectScoreFormat('tune.mid')).toBe('midi');
    expect(detectScoreFormat('tune.abc')).toBe('abc');
    expect(detectScoreFormat('tune.pdf')).toBe(null);
  });
});
