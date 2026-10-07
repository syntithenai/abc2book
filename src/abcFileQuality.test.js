/**
 * Runs the in-app Bulk Check plus tunebook import conventions over an ABC file.
 *
 *   ABC_QUALITY_FILE=path/to/file.abc CI=true npm test -- --watchAll=false src/abcFileQuality.test.js
 *
 * Skipped when ABC_QUALITY_FILE is not set.
 */
import fs from 'fs';
import useAbcTools from './useAbcTools';
import { buildTuneCheckReport } from './tuneBulkCheckReport';

const FILE = process.env.ABC_QUALITY_FILE;
const MAX_VOICES = 4;

function voiceNotes(tune) {
  return Object.keys(tune.voices || {}).map(function(key) {
    return key + ':' + (tune.voices[key].notes || []).join('\n').replace(/\s+/g, '');
  }).join('|');
}

function conventionIssues(tune, abcTools) {
  const issues = [];
  const voiceKeys = Object.keys(tune.voices || {});
  const hasNotes = voiceKeys.some(function(key) {
    return (tune.voices[key].notes || []).some(function(line) { return String(line).trim(); });
  });
  if (!/^[0-9a-f]{24}$/.test(String(tune.id || ''))) issues.push('tune_id is not 24 hex chars');
  if (!String(tune.name || '').trim()) issues.push('missing title');
  if (!String(tune.composer || '').trim()) issues.push('missing C: (auto-enrich only searches with an artist)');
  if (!Array.isArray(tune.tags) || tune.tags.length === 0) issues.push('no tags');
  if (!Array.isArray(tune.links) || !tune.links.some(function(l) { return l && l.link; })) issues.push('no links');
  if (voiceKeys.length > MAX_VOICES) issues.push(voiceKeys.length + ' voices (limit ' + MAX_VOICES + ')');
  if (Array.isArray(tune.books) && tune.books.length) issues.push('B: sets books ' + JSON.stringify(tune.books));
  if (hasNotes) {
    if (!tune.meter) issues.push('notation without M:');
    if (!tune.noteLength) issues.push('notation without L:');
    if (!tune.key) issues.push('notation without K:');
    if (!tune.srcUrl) issues.push('notation without abcbook-src-url');
    if (voiceKeys.length > 1 && (tune.tags || []).indexOf('multipart') === -1) {
      issues.push('multi-voice tune not tagged multipart');
    }
  }
  const rhythmTypes = abcTools.getRhythmTypes();
  const rhythm = String(tune.rhythm || '').trim().toLowerCase();
  if (rhythm && rhythmTypes[rhythm] && tune.meter && rhythmTypes[rhythm] !== tune.meter) {
    issues.push('R: ' + rhythm + ' expects M:' + rhythmTypes[rhythm] + ' but has M:' + tune.meter);
  }
  const reparsed = abcTools.abc2Tunebook(abcTools.json2abc(tune))[0];
  if (!reparsed || voiceNotes(reparsed) !== voiceNotes(tune)) {
    issues.push('notation changes after a save round trip');
  }
  return issues;
}

(FILE ? describe : describe.skip)('ABC file quality: ' + (FILE || '(set ABC_QUALITY_FILE)'), function() {
  test('report', function() {
    const abcTools = useAbcTools();
    const tunes = abcTools.abc2Tunebook(fs.readFileSync(FILE, 'utf8'));
    const lines = [];
    let problems = 0;
    tunes.forEach(function(tune) {
      const report = buildTuneCheckReport(tune, { abcTools: abcTools });
      const bulk = report && Array.isArray(report.issues) ? report.issues : [];
      const conventions = conventionIssues(tune, abcTools);
      const severity = report ? report.severity : 'n/a';
      lines.push('[' + severity + '] ' + tune.name + ' (' + Object.keys(tune.voices || {}).length + ' voices)');
      bulk.forEach(function(item) {
        lines.push('    bulk ' + (item.severity || '') + ' ' + (item.code || '') + ': ' + (item.message || ''));
      });
      conventions.forEach(function(text) { lines.push('    convention: ' + text); });
      if (conventions.length) problems += 1;
    });
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(tunes.length).toBeGreaterThan(0);
    expect(problems).toBe(0);
  });
});
