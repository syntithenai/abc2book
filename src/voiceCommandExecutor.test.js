import {
  findTuneCandidates,
  hasSearchCueWords,
  isMeaningfulVoiceTranscript,
  scoreTuneMatch,
  shouldAutoPickCandidate,
  stripVoiceCommandWords,
} from './voiceCommandUtils';
import { executeVoiceCommand } from './voiceCommandExecutor';

describe('voiceCommandUtils', function() {
  test('stripVoiceCommandWords removes command prefixes', function() {
    expect(stripVoiceCommandWords('show down by the sally gardens')).toBe('down sally gardens');
  });

  test('scoreTuneMatch prefers exact title', function() {
    const exact = scoreTuneMatch('wild rover', { name: 'Wild Rover', composer: '' });
    const partial = scoreTuneMatch('wild rover', { name: 'The Wild Rover Song', composer: '' });
    expect(exact).toBeGreaterThan(0);
    expect(exact).toBeGreaterThanOrEqual(partial);
  });

  test('findTuneCandidates returns sorted matches', function() {
    const tunes = {
      a: { id: 'a', name: 'Down By The Sally Gardens', composer: '' },
      b: { id: 'b', name: 'Wild Rover', composer: '' },
    };
    const results = findTuneCandidates('sally gardens', tunes);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tune.id).toBe('a');
  });

  test('shouldAutoPickCandidate when score gap is large', function() {
    expect(shouldAutoPickCandidate([
      { score: 20 },
      { score: 4 },
    ])).toBe(true);
    expect(shouldAutoPickCandidate([
      { score: 10 },
      { score: 8 },
    ])).toBe(false);
  });

  test('hasSearchCueWords detects search language', function() {
    expect(hasSearchCueWords('search jigs in my book')).toBe(true);
    expect(hasSearchCueWords('wild rover')).toBe(false);
  });

  test('isMeaningfulVoiceTranscript rejects punctuation-only input', function() {
    expect(isMeaningfulVoiceTranscript('...')).toBe(false);
    expect(isMeaningfulVoiceTranscript('.,!')).toBe(false);
    expect(isMeaningfulVoiceTranscript('wild rover')).toBe(true);
  });

  test('findTuneCandidates ignores punctuation-only input', function() {
    const tunes = {
      a: { id: 'a', name: 'Wild Rover', composer: '' },
    };
    expect(findTuneCandidates('...', tunes)).toEqual([]);
  });
});

describe('voiceCommandExecutor', function() {
  test('executeVoiceCommand navigates on SHOW', async function() {
    const navigated = [];
    const context = {
      tunes: {
        t1: { id: 't1', name: 'Wild Rover', composer: '' },
      },
      tunebook: {
        navigate: function(path) { navigated.push(path); },
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: 'show wild rover',
      tool: 'SHOW',
      title: 'wild rover',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(navigated).toEqual(['/tunes/t1']);
    expect(context.setCurrentTune).toHaveBeenCalledWith('t1');
  });

  test('executeVoiceCommand navigates on OPEN_TOOL', async function() {
    const navigated = [];
    const context = {
      tunes: {},
      tunebook: {
        navigate: function(path) { navigated.push(path); },
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: 'open metronome tool',
      tool: 'OPEN_TOOL',
      title: 'metronome',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(navigated).toEqual(['/metronome']);
    expect(context.onFeedback).toHaveBeenCalledWith('Opening Metronome');
  });

  test('executeVoiceCommand applies SEARCH filters', async function() {
    const navigated = [];
    const context = {
      tunes: {},
      tunebook: {
        navigate: function(path) { navigated.push(path); },
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: 'search jigs',
      tool: 'SEARCH',
      searchText: 'jigs',
      tags: ['session'],
      book: 'My Book',
      confidence: 0.9,
    }, context);

    expect(result.ok).toBe(true);
    expect(context.setFilter).toHaveBeenCalledWith('');
    expect(context.setCurrentTuneBook).toHaveBeenCalledWith('My Book');
    expect(context.setTagFilter).toHaveBeenCalledWith(['session']);
    expect(context.setFilter).toHaveBeenCalledWith('jigs');
    expect(navigated).toEqual(['/tunes']);
  });

  test('executeVoiceCommand falls back to fuzzy SHOW', async function() {
    const navigated = [];
    const context = {
      tunes: {
        t1: { id: 't1', name: 'Wild Rover', composer: '' },
      },
      tunebook: {
        navigate: function(path) { navigated.push(path); },
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: 'wild rover',
      tool: 'NONE',
      confidence: 0.2,
    }, context);

    expect(result.ok).toBe(true);
    expect(navigated).toEqual(['/tunes/t1']);
  });

  test('executeVoiceCommand rejects punctuation-only transcript', async function() {
    const context = {
      tunes: {
        t1: { id: 't1', name: 'Wild Rover', composer: '' },
      },
      tunebook: {
        navigate: jest.fn(),
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onDisambiguate: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: '...',
      tool: 'SHOW',
      title: '...',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(false);
    expect(context.onFeedback).toHaveBeenCalledWith('No matches for ...');
    expect(context.onDisambiguate).not.toHaveBeenCalled();
    expect(context.tunebook.navigate).not.toHaveBeenCalled();
  });
});
