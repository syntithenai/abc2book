import {
  audioGenerationUnavailableMessage,
  defaultPresetForTask,
  formatAudioGenerationError,
  isTaskAvailable,
  linkTitleForTask,
  listAvailableQualityPresets,
  listQualityPresetOptions,
  presetLabel,
  TASK_LINKED_COVER,
  TASK_PRACTICE_TRACK,
} from './audioGenerationPresets';

describe('audioGenerationPresets', function() {
  test('default preset is balanced for practice track and linked cover', function() {
    expect(defaultPresetForTask(TASK_PRACTICE_TRACK)).toBe('balanced');
    expect(defaultPresetForTask(TASK_LINKED_COVER)).toBe('balanced');
  });

  test('preset labels', function() {
    expect(presetLabel('fast')).toBe('Fast');
    expect(presetLabel('high')).toBe('High');
  });

  test('link titles per task', function() {
    expect(linkTitleForTask(TASK_PRACTICE_TRACK, 'Reel')).toBe('Reel (AI arrangement)');
    expect(linkTitleForTask(TASK_LINKED_COVER, 'Reel')).toBe('Reel (AI cover)');
  });

  test('isTaskAvailable reads backends payload', function() {
    const backends = {
      tasks: [
        {
          taskId: TASK_LINKED_COVER,
          presets: [{ id: 'fast', available: true }],
        },
      ],
    };
    expect(isTaskAvailable(backends, TASK_LINKED_COVER)).toBe(true);
    expect(isTaskAvailable(backends, TASK_PRACTICE_TRACK)).toBe(false);
  });

  test('listQualityPresetOptions keeps unavailable presets from backends', function() {
    const backends = {
      ok: false,
      tasks: [{
        taskId: TASK_PRACTICE_TRACK,
        presets: [
          { id: 'fast', available: false },
          { id: 'balanced', available: false },
        ],
      }],
    };
    const options = listQualityPresetOptions(backends, TASK_PRACTICE_TRACK);
    expect(options).toHaveLength(2);
    expect(listAvailableQualityPresets(backends, TASK_PRACTICE_TRACK)).toEqual([]);
  });

  test('listQualityPresetOptions falls back when backends are missing', function() {
    const options = listQualityPresetOptions(null, TASK_PRACTICE_TRACK);
    expect(options.map(function(item) { return item.id; })).toEqual(['fast', 'balanced', 'high']);
    expect(options.every(function(item) { return item.available === true; })).toBe(true);
  });

  test('audioGenerationUnavailableMessage explains audio.cpp outage', function() {
    expect(audioGenerationUnavailableMessage({
      ok: false,
      provider: { provider: 'audio_cpp', message: 'Sidecar not reachable' },
    })).toMatch(/audio\.cpp sidecar is not available/);
    expect(audioGenerationUnavailableMessage({ ok: true })).toBe('');
  });

  test('formatAudioGenerationError explains missing audio.cpp models', function() {
    expect(formatAudioGenerationError(
      'audio.cpp HTTP 500: {"error":{"message":"unknown model id: stable-audio-3-medium"}}'
    )).toMatch(/stable-audio-3-medium/);
    expect(formatAudioGenerationError('')).toBe('Audio generation failed');
  });
});
