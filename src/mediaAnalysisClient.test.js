import {
  analysisPlanForSuggestionKinds,
  getDetectedTempoFromAnalysis,
  handleAnalysisStreamEvent,
  normalizeChordsOnlyAnalysis,
  normalizeMediaAnalysis,
  normalizeTimingOnlyAnalysis,
  tuneHasTempo,
} from './mediaAnalysisClient';
import {
  buildAnalysisProcessingPayload,
  resolveDemucsModelForSettings,
  resolveMelodyVoicing,
} from './melodyProcessingSettings';

describe('handleAnalysisStreamEvent', function() {
  test('forwards progress updates', function() {
    const updates = [];
    handleAnalysisStreamEvent({
      type: 'progress',
      message: 'Detecting timing...',
      progress: 15,
    }, function(message, progress) {
      updates.push({ message: message, progress: progress });
    });
    expect(updates).toEqual([{ message: 'Detecting timing...', progress: 15 }]);
  });

  test('returns normalized result events', function() {
    const result = handleAnalysisStreamEvent({
      type: 'result',
      body: {
        lyrics: { text: 'hello', segments: [] },
        chords: { segments: [], beatTimes: [] },
        melody: { notes: [] },
        timing: { beatTimes: [], meter: '4/4' },
      },
    });
    expect(result.lyrics.text).toBe('hello');
    expect(result.timing.meter).toBe('4/4');
  });

  test('throws on error events', function() {
    expect(function() {
      handleAnalysisStreamEvent({ type: 'error', message: 'failed' });
    }).toThrow('failed');
  });
});

describe('normalizeMediaAnalysis', function() {
  test('preserves inputsUsed and warnings', function() {
    const result = normalizeMediaAnalysis({
      lyrics: { text: 'hi' },
      chords: { segments: [], backend: 'btc' },
      melody: { notes: [], backend: 'kong' },
      inputsUsed: {
        fromStemCache: true,
        stemCacheId: 'abc',
        stemModel: 'htdemucs_6s',
        musicType: 'piano',
        keySource: 'chords',
        melodyBackend: 'kong',
        chordBackend: 'btc',
        melodyVoicing: 'full',
      },
      warnings: ['key_inferred_from_chords', 'stems_separated_inline'],
      stemCacheId: 'abc',
      fromStemCache: true,
    });
    expect(result.inputsUsed.keySource).toBe('chords');
    expect(result.inputsUsed.stemModel).toBe('htdemucs_6s');
    expect(result.inputsUsed.melodyVoicing).toBe('full');
    expect(result.warnings).toEqual(['key_inferred_from_chords', 'stems_separated_inline']);
    expect(result.fromStemCache).toBe(true);
    expect(result.stemCacheId).toBe('abc');
  });
});

describe('buildAnalysisProcessingPayload', function() {
  test('includes demucsModel and melodyVoicing for piano', function() {
    const payload = buildAnalysisProcessingPayload({ musicType: 'piano' });
    expect(payload.demucsModel).toBe('htdemucs_6s');
    expect(payload.melodyVoicing).toBe('full');
  });

  test('defaults song to melody-line and non-6s demucs', function() {
    const payload = buildAnalysisProcessingPayload({ musicType: 'vocal' }, null, {
      demucsModel: 'htdemucs',
    });
    expect(payload.demucsModel).toBe('htdemucs');
    expect(payload.melodyVoicing).toBe('melody-line');
  });
});

describe('resolveDemucsModelForSettings / resolveMelodyVoicing', function() {
  test('forces 6s for piano', function() {
    expect(resolveDemucsModelForSettings({ musicType: 'piano' }, 'htdemucs')).toBe('htdemucs_6s');
  });

  test('full voicing for piano by default', function() {
    expect(resolveMelodyVoicing({ musicType: 'piano' })).toBe('full');
    expect(resolveMelodyVoicing({ musicType: 'vocal' })).toBe('melody-line');
  });
});

describe('getDetectedTempoFromAnalysis', function() {
  test('prefers timing tempo and rounds to nearest BPM', function() {
    expect(getDetectedTempoFromAnalysis({
      timing: { tempo: 119.6 },
      chords: { tempo: 90 },
    })).toBe(120);
  });

  test('falls back to chord tempo when timing is missing', function() {
    expect(getDetectedTempoFromAnalysis({
      chords: { tempo: 88.2 },
    })).toBe(88);
  });

  test('returns zero when no tempo is available', function() {
    expect(getDetectedTempoFromAnalysis({ timing: {}, chords: {} })).toBe(0);
  });
});

describe('tuneHasTempo', function() {
  test('accepts numeric and Q-field tempo values', function() {
    expect(tuneHasTempo({ tempo: 120 })).toBe(true);
    expect(tuneHasTempo({ tempo: '1/4=96' })).toBe(true);
  });

  test('rejects missing or invalid tempo', function() {
    expect(tuneHasTempo({})).toBe(false);
    expect(tuneHasTempo({ tempo: 0 })).toBe(false);
    expect(tuneHasTempo({ tempo: '' })).toBe(false);
  });
});

describe('analysisPlanForSuggestionKinds', function() {
  test('uses detect-timing for tempo-only', function() {
    expect(analysisPlanForSuggestionKinds(['tempo'])).toBe('detect-timing');
  });

  test('uses detect-chords when key is selected without heavy kinds', function() {
    expect(analysisPlanForSuggestionKinds(['key'])).toBe('detect-chords');
    expect(analysisPlanForSuggestionKinds(['key', 'tempo'])).toBe('detect-chords');
  });

  test('uses analyze-media for lyrics, notation, or chords', function() {
    expect(analysisPlanForSuggestionKinds(['lyrics'])).toBe('analyze-media');
    expect(analysisPlanForSuggestionKinds(['notation', 'tempo'])).toBe('analyze-media');
    expect(analysisPlanForSuggestionKinds(['chords', 'key'])).toBe('analyze-media');
  });

  test('defaults to analyze-media when kinds empty', function() {
    expect(analysisPlanForSuggestionKinds([])).toBe('analyze-media');
    expect(analysisPlanForSuggestionKinds(null)).toBe('analyze-media');
  });
});

describe('normalizeTimingOnlyAnalysis / normalizeChordsOnlyAnalysis', function() {
  test('timing-only exposes tempo on timing and chords', function() {
    const result = normalizeTimingOnlyAnalysis({
      beatTimes: [0, 0.5, 1],
      tempo: 120.4,
      meter: '4/4',
      backend: 'librosa',
    });
    expect(result.timing.tempo).toBe(120.4);
    expect(result.timing.meter).toBe('4/4');
    expect(getDetectedTempoFromAnalysis(result)).toBe(120);
  });

  test('chords-only exposes detected key and tempo', function() {
    const result = normalizeChordsOnlyAnalysis({
      segments: [{ chord: 'C', start: 0, end: 1 }],
      beatTimes: [0, 0.5],
      tempo: 96,
      detectedKey: 'C',
      keySource: 'chords',
      backend: 'btc',
    });
    expect(result.chords.detectedKey).toBe('C');
    expect(result.chords.tempo).toBe(96);
    expect(getDetectedTempoFromAnalysis(result)).toBe(96);
  });
});
