import {
  defaultCoverStylePrompt,
  hasPracticeTrackMidiData,
  linkSupportsAudioCover,
  linkedCoverSourceFilename,
  tuneHasRenderableMelody,
} from './audioGenerationActions';

describe('audioGenerationActions', function() {
  test('linkSupportsAudioCover accepts playable audio sources', function() {
    expect(linkSupportsAudioCover({ link: 'https://youtu.be/abc' }, function(url) {
      return /youtube/.test(url);
    })).toBe(true);
    expect(linkSupportsAudioCover({ link: 'https://example.com/a.mp3' }, function() { return false; })).toBe(true);
    expect(linkSupportsAudioCover({ link: 'https://example.com/a.mid' }, function() { return false; })).toBe(true);
    expect(linkSupportsAudioCover({ link: '' }, function() { return false; })).toBe(false);
  });

  test('defaultCoverStylePrompt uses rhythm when present', function() {
    expect(defaultCoverStylePrompt({ rhythm: 'Reel' }, null)).toContain('Reel');
    expect(defaultCoverStylePrompt({ rhythm: 'Reel' }, null)).toContain('melody');
  });

  test('defaultCoverStylePrompt ignores practice-track backing prompt', function() {
    const plan = {
      backingPrompt: '120 BPM, accompaniment only, no lead melody',
      musical: { rhythm: 'Reel' },
    };
    const prompt = defaultCoverStylePrompt({ rhythm: 'Reel' }, plan);
    expect(prompt).not.toContain('no lead melody');
    expect(prompt).toContain('melody');
  });

  test('linkedCoverSourceFilename uses mp3 for recordings', function() {
    expect(linkedCoverSourceFilename({ title: 'My take' }, { name: 'Tune' }, 'recording', null))
      .toBe('My_take.mp3');
  });

  test('hasPracticeTrackMidiData is false without tunebook tools', function() {
    expect(hasPracticeTrackMidiData({ name: 'Test' }, null, null)).toBe(false);
  });

  test('hasPracticeTrackMidiData is false without melody notes', function() {
    const tune = {
      name: 'Links only',
      meter: '4/4',
      key: 'C',
      voices: { '1': { meta: '', notes: [''] } },
    };
    const tunebook = {
      abcTools: {
        json2abc: function() { return 'X:1\nM:4/4\nK:C\n'; },
      },
    };
    expect(tuneHasRenderableMelody(tune)).toBe(false);
    expect(hasPracticeTrackMidiData(tune, tunebook, null)).toBe(false);
  });

  test('hasPracticeTrackMidiData is false for rest-only scaffold', function() {
    const tune = {
      name: 'Scaffold',
      voices: { '1': { meta: '', notes: ['z z z z |'] } },
    };
    expect(tuneHasRenderableMelody(tune)).toBe(false);
    expect(hasPracticeTrackMidiData(tune, { abcTools: { json2abc: function() { return ''; } } }, null)).toBe(false);
  });
});
