import {
  getDetectedTempoFromAnalysis,
  handleAnalysisStreamEvent,
  normalizeMediaAnalysis,
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
