import {
  NOTATION_FIT_HEIGHT_MIN_LINES,
  countTuneNotationLines,
  defaultNotationFitModeForTune,
  effectiveNotationLineCount,
} from './notationFitSettings';
import { NOTATION_FIT_HORIZONTAL, NOTATION_FIT_VERTICAL } from './gigNotationFit';

describe('notationFitSettings', function() {
  describe('countTuneNotationLines', function() {
    it('returns 0 for missing tune or voices', function() {
      expect(countTuneNotationLines(null)).toBe(0);
      expect(countTuneNotationLines({})).toBe(0);
    });

    it('counts non-empty note lines in a single voice', function() {
      const tune = {
        voices: {
          1: { notes: ['C D E', '', 'F G A', 'B c d', 'e f g'] },
        },
      };
      expect(countTuneNotationLines(tune)).toBe(4);
    });

    it('uses the voice with the most lines among active voices', function() {
      const tune = {
        voices: {
          1: { notes: ['C D', 'E F'] },
          2: { notes: ['C', 'D', 'E', 'F', 'G'] },
        },
      };
      expect(countTuneNotationLines(tune)).toBe(5);
      expect(countTuneNotationLines(tune, ['1'])).toBe(2);
      expect(countTuneNotationLines(tune, ['2'])).toBe(5);
    });
  });

  describe('effectiveNotationLineCount', function() {
    it('multiplies source lines by active voice count', function() {
      const tune = {
        voices: {
          1: { notes: ['a', 'b', 'c'] },
          2: { notes: ['a', 'b', 'c'] },
        },
      };
      expect(effectiveNotationLineCount(tune, ['1'])).toBe(3);
      expect(effectiveNotationLineCount(tune, ['1', '2'])).toBe(6);
    });
  });

  describe('defaultNotationFitModeForTune', function() {
    it('defaults to fit-width even for short scores', function() {
      const tune = {
        voices: { 1: { notes: ['a', 'b', 'c', 'd'] } },
      };
      expect(effectiveNotationLineCount(tune, ['1'])).toBeLessThan(NOTATION_FIT_HEIGHT_MIN_LINES);
      expect(defaultNotationFitModeForTune(tune, ['1'])).toBe(NOTATION_FIT_HORIZONTAL);
    });

    it('defaults to fit-width even for tall scores', function() {
      const tune = {
        voices: { 1: { notes: ['a', 'b', 'c', 'd', 'e'] } },
      };
      expect(defaultNotationFitModeForTune(tune, ['1'])).toBe(NOTATION_FIT_HORIZONTAL);
      expect(defaultNotationFitModeForTune(tune, ['1'])).not.toBe(NOTATION_FIT_VERTICAL);
    });

    it('defaults to fit-width for multi-voice tall scores', function() {
      const twoVoicesThreeLines = {
        voices: {
          1: { notes: ['a', 'b', 'c'] },
          2: { notes: ['a', 'b', 'c'] },
        },
      };
      expect(effectiveNotationLineCount(twoVoicesThreeLines, ['1', '2'])).toBe(6);
      expect(defaultNotationFitModeForTune(twoVoicesThreeLines, ['1', '2'])).toBe(NOTATION_FIT_HORIZONTAL);
    });
  });
});
