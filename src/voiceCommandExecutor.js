import {
  VOICE_APP_TOOL_ROUTES,
  VOICE_CONFIDENCE_THRESHOLD,
  findTuneCandidates,
  getVoiceSearchableText,
  hasSearchCueWords,
  isMeaningfulVoiceTranscript,
  shouldAutoPickCandidate,
} from './voiceCommandUtils';
import { playTuneNow } from './tunePlaybackActions';
import { clampTuneIds } from './nowPlayingQueue';

function transcriptWantsPlayback(transcript) {
  return /^\s*play\b/i.test(String(transcript || ''));
}

function buildSearchFilter(result) {
  const parts = [];
  if (result.searchText) parts.push(result.searchText);
  if (result.title && result.title !== result.searchText) parts.push(result.title);
  if (result.artist) parts.push(result.artist);
  return parts.join(' ').trim();
}

function buildPlaylistLabel(result) {
  if (result.filterKind && result.filterValue) {
    return result.filterKind + ' ' + result.filterValue;
  }
  if (result.book) return 'book ' + result.book;
  if (result.genre) return 'genre ' + result.genre;
  if (result.artist) return 'artist ' + result.artist;
  if (result.tags && result.tags.length > 0) return 'tag ' + result.tags.join(', ');
  if (result.title) return 'title ' + result.title;
  return 'voice selection';
}

function collectPlaylistTunes(result, context) {
  if (!context || !context.tunebook || !context.tunes) return [];
  const filter = String(result.filterValue || result.searchText || result.title || '').trim();
  const artist = String(result.artist || '').trim();
  const book = String(result.book || '').trim();
  const genre = String(result.genre || '').trim();
  const tags = Array.isArray(result.tags) ? result.tags.filter(Boolean) : [];

  if (result.filterKind === 'artist' || (!result.filterKind && artist)) {
    return context.tunebook.fromSearch('', '', [], genre ? [genre] : [], artist ? [artist] : []);
  }
  if (result.filterKind === 'genre' || (!result.filterKind && genre)) {
    return context.tunebook.fromSearch('', '', [], genre ? [genre] : [], []);
  }
  if (result.filterKind === 'tag' || (!result.filterKind && tags.length > 0)) {
    return context.tunebook.fromSearch('', '', tags, [], []);
  }
  if (result.filterKind === 'book' || (!result.filterKind && book)) {
    return context.tunebook.fromSearch(filter, book, [], [], []);
  }
  return context.tunebook.fromSearch(filter, '', [], [], []);
}

function executePlayFilter(result, context) {
  if (!context || !context.tunebook || !context.tunebook.createQueueFromTuneIds || !context.tunebook.startNowPlayingQueue) {
    if (context.onFeedback) context.onFeedback('Playback is not available right now');
    return { ok: false };
  }

  const tunes = collectPlaylistTunes(result, context) || [];
  const tuneIds = clampTuneIds(tunes.map(function(tune) { return tune && tune.id; }).filter(Boolean));
  if (!tuneIds.length) {
    if (context.onFeedback) context.onFeedback('No matches for ' + buildPlaylistLabel(result));
    return { ok: false };
  }

  const queue = context.tunebook.createQueueFromTuneIds(tuneIds, {
    name: 'Voice: ' + buildPlaylistLabel(result),
    source: 'voice',
  });
  context.tunebook.startNowPlayingQueue(queue, context.tunebook.navigate, {
    startPlayback: true,
    mediaController: context.mediaController,
  });

  if (context.onFeedback) context.onFeedback('Playing ' + buildPlaylistLabel(result));
  return { ok: true, queue: queue };
}

function executeStopPlayback(context) {
  if (context && context.mediaController && typeof context.mediaController.stop === 'function') {
    context.mediaController.stop();
  }
  if (context && context.tunebook && typeof context.tunebook.clearNowPlayingQueue === 'function') {
    context.tunebook.clearNowPlayingQueue();
  }
  if (context && context.onFeedback) context.onFeedback('Stopped playback');
  return { ok: true };
}

function executeHelpAnswer(result, context) {
  if (context && typeof context.onHelpAnswer === 'function') {
    context.onHelpAnswer({
      transcript: result.transcript || '',
      question: result.transcript || result.title || '',
      answer: result.helpAnswer || '',
      links: Array.isArray(result.helpLinks) ? result.helpLinks : [],
    });
    return { ok: true };
  }
  if (context && context.onFeedback) context.onFeedback(result.helpAnswer || 'Help answer ready');
  return { ok: true };
}

function navigateToTune(context, tune, options) {
  if (!tune || !tune.id) return;
  const startPlayback = !!(options && options.startPlayback);
  context.setCurrentTune(tune.id);

  let started = false;
  if (startPlayback && context.mediaController && context.tunebook) {
    started = !!playTuneNow(
      context.mediaController,
      context.tunebook,
      context.tunebook.navigate,
      tune
    );
  }
  if (!started) {
    context.tunebook.navigate('/tunes/' + tune.id);
  }

  const action = started ? 'Playing' : 'Opening';
  if (context.onFeedback && !(options && options.suppressFeedback)) {
    context.onFeedback(action + ' ' + (tune.name || 'tune'));
  }
  if (!options || !options.suppressFeedback) {
    if (context.speakFeedback && typeof window !== 'undefined' && typeof window.speak === 'function') {
      window.speak(action + ' ' + (tune.name || 'tune'));
    }
  }
}

function noMatchesFeedback(context, transcript) {
  const label = String(transcript || '').trim() || 'that';
  if (context.onFeedback) context.onFeedback('No matches for ' + label);
}

async function executeShow(query, context, transcriptLabel, options) {
  const displayTranscript = transcriptLabel || query;
  const startPlayback = !!(options && options.startPlayback);
  if (!isMeaningfulVoiceTranscript(query)) {
    noMatchesFeedback(context, displayTranscript);
    return { ok: false };
  }

  const cleaned = getVoiceSearchableText(query);
  if (!cleaned) {
    noMatchesFeedback(context, displayTranscript);
    return { ok: false };
  }

  const candidates = findTuneCandidates(cleaned, context.tunes);
  if (candidates.length === 0) {
    noMatchesFeedback(context, displayTranscript);
    return { ok: false };
  }

  if (shouldAutoPickCandidate(candidates)) {
    navigateToTune(context, candidates[0].tune, { startPlayback: startPlayback });
    return { ok: true, tune: candidates[0].tune };
  }

  if (context.onDisambiguate) {
    const picked = await context.onDisambiguate(candidates.map(function(entry) {
      return entry.tune;
    }), cleaned);
    if (picked) {
      navigateToTune(context, picked, {
        startPlayback: startPlayback,
        suppressFeedback: true,
      });
      return { ok: true, tune: picked };
    }
    return { ok: false };
  }

  if (context.onFeedback) context.onFeedback('Multiple tunes match "' + cleaned + '"');
  return { ok: false };
}

function executeOpenTool(result, context) {
  const toolName = String(result.title || '').toLowerCase().trim();
  const route = VOICE_APP_TOOL_ROUTES[toolName];
  if (!route) {
    if (context.onFeedback) {
      context.onFeedback('Unknown tool — try metronome, tuner, chords, or keyboard');
    }
    return { ok: false };
  }

  context.tunebook.navigate(route);
  const label = toolName.charAt(0).toUpperCase() + toolName.slice(1);
  if (context.onFeedback) context.onFeedback('Opening ' + label);
  if (context.speakFeedback && typeof window !== 'undefined' && typeof window.speak === 'function') {
    window.speak('Opening ' + label);
  }
  return { ok: true };
}

function executeSearch(result, context) {
  context.setFilter('');
  context.setCurrentTuneBook('');
  context.setTagFilter([]);
  if (context.setGroupBy) context.setGroupBy('');

  if (result.book) context.setCurrentTuneBook(result.book);
  if (result.tags && result.tags.length > 0) context.setTagFilter(result.tags);

  const filterText = buildSearchFilter(result);
  if (filterText) context.setFilter(filterText);

  context.tunebook.navigate('/tunes');

  const summaryParts = [];
  if (result.book) summaryParts.push('book ' + result.book);
  if (result.tags && result.tags.length > 0) summaryParts.push('tags ' + result.tags.join(', '));
  if (filterText) summaryParts.push('"' + filterText + '"');
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'filters';
  if (context.onFeedback) context.onFeedback('Searching: ' + summary);
  return { ok: true };
}

export async function executeVoiceCommand(result, context) {
  const transcript = result && result.transcript ? String(result.transcript).trim() : '';
  if (!transcript) {
    if (context.onFeedback) context.onFeedback("Didn't catch that — try again");
    return { ok: false };
  }

  if (context && context.voiceMode === 'help' && result.tool !== 'ASK_HELP') {
    if (context.onFeedback) context.onFeedback('Use help questions on the help page or in the notation editor help dialog');
    return { ok: false };
  }

  if (context && context.voiceMode !== 'help' && result.tool === 'ASK_HELP') {
    if (context.onFeedback) context.onFeedback('Help questions are available on the Help page or in the notation editor help dialog');
    return { ok: false };
  }

  if (!isMeaningfulVoiceTranscript(transcript)) {
    noMatchesFeedback(context, transcript);
    return { ok: false };
  }

  const isSearch = result.tool === 'SEARCH' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isShow = result.tool === 'SHOW' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isPlay = result.tool === 'PLAY' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isOpenTool = result.tool === 'OPEN_TOOL';
  const isPlayFilter = result.tool === 'PLAY_FILTER' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isStopPlayback = result.tool === 'STOP_PLAYBACK' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isHelpAnswer = result.tool === 'ASK_HELP' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;

  if (isOpenTool) {
    if (result.confidence >= VOICE_CONFIDENCE_THRESHOLD) {
      return executeOpenTool(result, context);
    }
    if (context.onFeedback) {
      context.onFeedback('Unknown tool — try metronome, tuner, chords, or keyboard');
    }
    return { ok: false };
  }

  if (isStopPlayback) {
    return executeStopPlayback(context);
  }

  if (isHelpAnswer) {
    return executeHelpAnswer(result, context);
  }

  if (isPlayFilter) {
    return executePlayFilter(result, context);
  }

  if (isSearch) {
    return executeSearch(result, context);
  }

  if (isPlay) {
    return executeShow(result.title || result.transcript, context, transcript, {
      startPlayback: true,
    });
  }

  if (isShow) {
    // Older resolvers / LLM may still classify "play <title>" as SHOW.
    return executeShow(result.title || result.transcript, context, transcript, {
      startPlayback: transcriptWantsPlayback(transcript),
    });
  }

  if (hasSearchCueWords(result.transcript)) {
    if (context.onFeedback) context.onFeedback("Try saying 'search …' more clearly");
    return { ok: false };
  }

  return executeShow(result.transcript, context, transcript, {
    startPlayback: transcriptWantsPlayback(transcript),
  });
}
