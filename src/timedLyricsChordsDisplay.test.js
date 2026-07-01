import { buildLinesFromTune, buildTimedAlignedLines } from './timedLyricsChordsDisplay';
import { buildTimedLyricsFromTranscription } from './timedLyricsModel';
import { buildTimedChordsFromDetection } from './timedChordsModel';

describe('timedLyricsChordsDisplay', function() {
  test('uses edited wLines without attaching timed chords', function() {
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'old lyric line' }],
    }, {});
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const tune = {
      wLines: ['new lyric line'],
      timedLyrics: timedLyrics,
      timedChords: timedChords,
    };

    const lines = buildLinesFromTune(tune);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('new lyric line');
    expect(lines[0].chord).toBe('');
  });

  test('does not fall back to timed lyrics when no wLines exist', function() {
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'legacy only' }],
    }, {});
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'G:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const lines = buildLinesFromTune({
      timedLyrics: timedLyrics,
      timedChords: timedChords,
    });
    expect(lines).toHaveLength(0);
  });

  test('buildTimedAlignedLines attaches timed chords to wLines', function() {
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'old lyric line' }],
    }, {});
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const lines = buildTimedAlignedLines({
      wLines: ['new lyric line'],
      timedLyrics: timedLyrics,
      timedChords: timedChords,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('new lyric line');
    expect(lines[0].chord).toBeTruthy();
  });
});
