import fs from 'fs';
import path from 'path';
import {
  checkForMissingXmlHeader,
  extractMusicXmlFromMxl,
  isMusicXmlText,
  isMuseScoreNativeText,
} from './mxlExtract';
import { musicXmlToAbc } from './musicXmlToAbc';
import { detectScoreFormat } from './scoreImportClient';
import { MINIMAL_MUSICXML, MUSICXML_WITH_NOTE_LYRICS } from './__fixtures__/musicXmlSamples';
import { abcTextToCandidates } from './importSourceParse';
import useAbcTools from './useAbcTools';

describe('mxlExtract', function() {
  test('isMusicXmlText detects xml and score-partwise', function() {
    expect(isMusicXmlText('<?xml version="1.0"?><score-partwise></score-partwise>')).toBe(true);
    expect(isMusicXmlText('plain text')).toBe(false);
  });

  test('isMuseScoreNativeText detects MuseScore root element', function() {
    expect(isMuseScoreNativeText('<?xml version="1.0"?><museScore version="4.00"></museScore>')).toBe(true);
    expect(isMuseScoreNativeText('<?xml version="1.0"?><score-partwise></score-partwise>')).toBe(false);
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

  test('converts note lyrics to ABC w: lines', function() {
    const abc = musicXmlToAbc(MUSICXML_WITH_NOTE_LYRICS, { fileName: 'hello-lyrics.xml' });
    expect(abc).toMatch(/^w:/m);
    expect(abc.toLowerCase()).toMatch(/hel/);
    expect(abc.toLowerCase()).toMatch(/lo/);
    expect(abc.toLowerCase()).toMatch(/world/);
  });

  test('rejects empty input', function() {
    expect(function() { musicXmlToAbc(''); }).toThrow('empty');
  });

  test('rejects invalid xml', function() {
    expect(function() { musicXmlToAbc('<not-xml'); }).toThrow();
  });
});

describe('score import captures note-aligned lyrics', function() {
  const abcTools = useAbcTools();

  test('MusicXML lyrics become wLines and derived words on candidates', function() {
    const abc = musicXmlToAbc(MUSICXML_WITH_NOTE_LYRICS, { fileName: 'hello-lyrics.xml' });
    const candidates = abcTextToCandidates(abc, { abcTools: abcTools }, '');
    expect(candidates.length).toBeGreaterThan(0);
    const tune = candidates[0].tune;
    expect(Array.isArray(tune.wLines) && tune.wLines.length).toBeTruthy();
    expect(tune.wLines.join(' ').toLowerCase()).toMatch(/hel/);
    expect(Array.isArray(tune.words) && tune.words.length).toBeTruthy();
    expect(tune.words.join(' ').toLowerCase()).toMatch(/hello/);
    expect(tune.words.join(' ').toLowerCase()).toMatch(/world/);
  });
});

describe('scoreImportClient', function() {
  test('detectScoreFormat maps extensions', function() {
    expect(detectScoreFormat('tune.mxl')).toBe('mxl');
    expect(detectScoreFormat('tune.musicxml')).toBe('musicxml');
    expect(detectScoreFormat('tune.mid')).toBe('midi');
    expect(detectScoreFormat('tune.mscx')).toBe('mscx');
    expect(detectScoreFormat('tune.abc')).toBe('abc');
    expect(detectScoreFormat('tune.pdf')).toBe(null);
  });
});
