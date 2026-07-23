import {
  findTuneCandidates,
  formatVoiceCommandFeedback,
  hasSearchCueWords,
  isMeaningfulVoiceTranscript,
  scoreTuneMatch,
  shouldAutoPickCandidate,
  stripVoiceCommandWords,
} from './voiceCommandUtils';
import { executeVoiceCommand } from './voiceCommandExecutor';

describe('voiceCommandUtils', function() {
  test('formatVoiceCommandFeedback combines transcript and action', function() {
    expect(formatVoiceCommandFeedback('show wild rover', 'Opening Wild Rover'))
      .toBe('"show wild rover" — Opening Wild Rover');
    expect(formatVoiceCommandFeedback('', 'Stopped playback')).toBe('Stopped playback');
    expect(formatVoiceCommandFeedback('hello', '')).toBe('hello');
  });

  test('stripVoiceCommandWords removes command prefixes', function() {
    expect(stripVoiceCommandWords('show down by the sally gardens')).toBe('down sally gardens');
  });

  test('scoreTuneMatch prefers exact title', function() {
    const exact = scoreTuneMatch('wild rover', { name: 'Wild Rover', composer: '' });
    const partial = scoreTuneMatch('wild rover', { name: 'The Wild Rover Song', composer: '' });
    expect(exact).toBeGreaterThan(0);
    expect(exact).toBeGreaterThanOrEqual(partial);
  });

  test('scoreTuneMatch matches titles without diacritics', function() {
    const score = scoreTuneMatch('reve', { name: 'Après un rêve', composer: 'Fauré' });
    expect(score).toBeGreaterThan(0);
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

  test('executeVoiceCommand plays a matched tune on PLAY', async function() {
    const navigated = [];
    const requestPlayback = jest.fn();
    const tune = {
      id: 't1',
      name: 'Smoke On The Water',
      composer: '',
      notes: 'CDEF',
      links: [],
    };
    const context = {
      tunes: { t1: tune },
      tunebook: {
        navigate: function(path) { navigated.push(path); },
        hasNotesOrChords: function(t) { return !!(t && t.notes); },
        hasLinks: function(t) { return !!(t && t.links && t.links.length); },
      },
      mediaController: {
        setTune: jest.fn(),
        setMediaLinkNumber: jest.fn(),
        requestPlayback: requestPlayback,
        isMidiPlaybackRoute: function() { return false; },
        isMediaPlaybackRoute: function() { return false; },
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: 'play smoke on the water',
      tool: 'PLAY',
      title: 'smoke on the water',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(context.setCurrentTune).toHaveBeenCalledWith('t1');
    expect(requestPlayback).toHaveBeenCalledWith(expect.objectContaining({
      tuneId: 't1',
      playState: 'playMidi',
      fromUserGesture: true,
      fresh: true,
    }));
    expect(navigated).toEqual(['/tunes/t1/playMidi']);
    expect(context.onFeedback).toHaveBeenCalledWith('Playing Smoke On The Water');
  });

  test('executeVoiceCommand starts playback when SHOW transcript begins with play', async function() {
    const navigated = [];
    const requestPlayback = jest.fn();
    const tune = {
      id: 't1',
      name: 'Smoke On The Water',
      composer: '',
      notes: 'CDEF',
      links: [],
    };
    const context = {
      tunes: { t1: tune },
      tunebook: {
        navigate: function(path) { navigated.push(path); },
        hasNotesOrChords: function(t) { return !!(t && t.notes); },
        hasLinks: function(t) { return !!(t && t.links && t.links.length); },
      },
      mediaController: {
        setTune: jest.fn(),
        setMediaLinkNumber: jest.fn(),
        requestPlayback: requestPlayback,
        isMidiPlaybackRoute: function() { return false; },
        isMediaPlaybackRoute: function() { return false; },
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: 'play smoke on the water',
      tool: 'SHOW',
      title: 'smoke on the water',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(requestPlayback).toHaveBeenCalled();
    expect(navigated).toEqual(['/tunes/t1/playMidi']);
  });

  test('executeVoiceCommand plays a filtered playlist', async function() {
    const tunes = [
      { id: 'a', name: 'Wild Rover', composer: '' },
      { id: 'b', name: 'Banish Misfortune', composer: '' },
    ];
    const context = {
      tunes: {
        a: tunes[0],
        b: tunes[1],
      },
      tunebook: {
        fromSearch: jest.fn(function() { return tunes; }),
        createQueueFromTuneIds: jest.fn(function(tuneIds, options) {
          return { tuneIds: tuneIds, name: options.name };
        }),
        startNowPlayingQueue: jest.fn(),
        navigate: jest.fn(),
      },
      mediaController: {},
      onFeedback: jest.fn(),
      voiceMode: 'playback',
    };

    const result = await executeVoiceCommand({
      transcript: 'play title wild rover',
      tool: 'PLAY_FILTER',
      filterKind: 'title',
      filterValue: 'wild rover',
      title: 'wild rover',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(context.tunebook.fromSearch).toHaveBeenCalledWith('wild rover', '', [], [], []);
    expect(context.tunebook.createQueueFromTuneIds).toHaveBeenCalledWith(['a', 'b'], expect.objectContaining({
      name: 'Voice: title wild rover',
      source: 'voice',
    }));
    expect(context.tunebook.startNowPlayingQueue).toHaveBeenCalled();
  });

  test('executeVoiceCommand stops playback', async function() {
    const context = {
      tunes: {},
      tunebook: {
        clearNowPlayingQueue: jest.fn(),
      },
      mediaController: {
        stop: jest.fn(),
      },
      onFeedback: jest.fn(),
      voiceMode: 'playback',
    };

    const result = await executeVoiceCommand({
      transcript: 'stop playing',
      tool: 'STOP_PLAYBACK',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(context.mediaController.stop).toHaveBeenCalled();
    expect(context.tunebook.clearNowPlayingQueue).toHaveBeenCalled();
    expect(context.onFeedback).toHaveBeenCalledWith('Stopped playback');
  });

  test('executeVoiceCommand opens help answers only in help mode', async function() {
    const context = {
      tunes: {},
      tunebook: {},
      onFeedback: jest.fn(),
      onHelpAnswer: jest.fn(),
      voiceMode: 'help',
    };

    const result = await executeVoiceCommand({
      transcript: 'how do i import from media',
      tool: 'ASK_HELP',
      helpAnswer: 'Use Add > Import from media.',
      helpLinks: ['/help#import-from-media'],
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(true);
    expect(context.onHelpAnswer).toHaveBeenCalledWith(expect.objectContaining({
      question: 'how do i import from media',
      answer: 'Use Add > Import from media.',
      links: ['/help#import-from-media'],
    }));
  });

  test('executeVoiceCommand rejects help answers outside help mode', async function() {
    const context = {
      tunes: {},
      tunebook: {},
      onFeedback: jest.fn(),
      onHelpAnswer: jest.fn(),
      voiceMode: 'playback',
    };

    const result = await executeVoiceCommand({
      transcript: 'how do i import from media',
      tool: 'ASK_HELP',
      helpAnswer: 'Use Add > Import from media.',
      helpLinks: ['/help#import-from-media'],
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(false);
    expect(context.onHelpAnswer).not.toHaveBeenCalled();
    expect(context.onFeedback).toHaveBeenCalledWith('Help questions are available on the Help page or in the notation editor help dialog');
  });

  test('executeVoiceCommand rejects playback commands in help mode', async function() {
    const context = {
      tunes: {
        t1: { id: 't1', name: 'Wild Rover', composer: '' },
      },
      tunebook: {
        navigate: jest.fn(),
      },
      onFeedback: jest.fn(),
      voiceMode: 'help',
    };

    const result = await executeVoiceCommand({
      transcript: 'show wild rover',
      tool: 'SHOW',
      title: 'wild rover',
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(false);
    expect(context.onFeedback).toHaveBeenCalledWith('Use help questions on the help page or in the notation editor help dialog');
    expect(context.tunebook.navigate).not.toHaveBeenCalled();
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

  test('executeVoiceCommand stays silent when disambiguation picker is dismissed', async function() {
    const context = {
      tunes: {
        t1: { id: 't1', name: 'Whats the Time', composer: '' },
        t2: { id: 't2', name: 'Whats the Time Mr Wolf', composer: '' },
      },
      tunebook: {
        navigate: jest.fn(),
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onDisambiguate: jest.fn(function() {
        return Promise.resolve(null);
      }),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: "show what's time",
      tool: 'SHOW',
      title: "what's time",
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(false);
    expect(context.onDisambiguate).toHaveBeenCalled();
    expect(context.onFeedback).not.toHaveBeenCalled();
    expect(context.tunebook.navigate).not.toHaveBeenCalled();
  });

  test('executeVoiceCommand reports multiple matches when no disambiguation handler', async function() {
    const context = {
      tunes: {
        t1: { id: 't1', name: 'Whats the Time', composer: '' },
        t2: { id: 't2', name: 'Whats the Time Mr Wolf', composer: '' },
      },
      tunebook: {
        navigate: jest.fn(),
      },
      setCurrentTune: jest.fn(),
      setFilter: jest.fn(),
      setCurrentTuneBook: jest.fn(),
      setTagFilter: jest.fn(),
      setGroupBy: jest.fn(),
      onFeedback: jest.fn(),
    };

    const result = await executeVoiceCommand({
      transcript: "show what's time",
      tool: 'SHOW',
      title: "what's time",
      confidence: 0.95,
    }, context);

    expect(result.ok).toBe(false);
    expect(context.onFeedback).toHaveBeenCalledWith('Multiple tunes match "what\'s time"');
    expect(context.tunebook.navigate).not.toHaveBeenCalled();
  });
});
