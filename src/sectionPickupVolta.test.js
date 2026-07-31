import useAbcTools from './useAbcTools';
import abcjs from 'abcjs';
import { abcForAbcjs } from './melodyBarlineNormalize';
import { analyzeVoiceBarDurations } from './tuneAbcStructureCheck';
import {
  parseRepeatBoundedSections,
  analyzeSectionPickupVoltaBoundaries,
  convertSectionPickupsToVoltasFlat,
} from './sectionPickupVolta';
import { flattenMelodyText } from './lyricBarAlignmentUtils';
import { ANACRUSIS_TWO_STRAINS } from './testFixtures/anacrusisDoubleBarlineFixtures';

describe('sectionPickupVolta', function() {
  const abcTools = useAbcTools();

  test('parses two repeat-bounded sections from fixture', function() {
    const noteLines = ANACRUSIS_TWO_STRAINS.split('\n');
    const sections = parseRepeatBoundedSections(noteLines);
    expect(sections.length).toBe(2);
    expect(sections[0].pickupBar).toBe('FG');
    expect(sections[1].pickupBar).toBe('de');
  });

  test('finds A-B boundary on fixture', function() {
    const noteLines = ANACRUSIS_TWO_STRAINS.split('\n');
    const abc = abcTools.emptyABC('Debug') + '\n' + noteLines.join('\n');
    const tune = abcTools.abc2json(abc);
    tune.meter = '4/4';
    tune.key = 'D';
    tune.noteLength = '1/8';
    const abcText = abcForAbcjs(abcTools.json2abc(tune));
    const parsed = abcjs.parseOnly(abcText)[0];
    const durationIssues = analyzeVoiceBarDurations(parsed);
    const boundaries = analyzeSectionPickupVoltaBoundaries(noteLines, durationIssues, parsed);
    expect(boundaries.length).toBe(1);
  });

  test('converted fixture suppresses further boundary warnings', function() {
    const noteLines = ANACRUSIS_TWO_STRAINS.split('\n');
    const converted = convertSectionPickupsToVoltasFlat(noteLines);
    expect(converted).not.toBeNull();
    const convertedLines = converted.split('\n');
    expect(flattenMelodyText(convertedLines)).toMatch(/\[[0-9]+/);
    expect(analyzeSectionPickupVoltaBoundaries(convertedLines, [], {
      getPickupLength: function() { return 0.5; },
    })).toEqual([]);
  });
});
