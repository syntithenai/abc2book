import {
  VOICE_APP_TOOL_ROUTES,
  VOICE_CONFIDENCE_THRESHOLD,
  findTuneCandidates,
  getVoiceSearchableText,
  hasSearchCueWords,
  isMeaningfulVoiceTranscript,
  shouldAutoPickCandidate,
} from './voiceCommandUtils';

function buildSearchFilter(result) {
  const parts = [];
  if (result.searchText) parts.push(result.searchText);
  if (result.title && result.title !== result.searchText) parts.push(result.title);
  if (result.artist) parts.push(result.artist);
  return parts.join(' ').trim();
}

function navigateToTune(context, tune) {
  if (!tune || !tune.id) return;
  context.setCurrentTune(tune.id);
  context.tunebook.navigate('/tunes/' + tune.id);
  if (context.onFeedback) {
    context.onFeedback('Opening ' + (tune.name || 'tune'));
  }
  if (context.speakFeedback && typeof window !== 'undefined' && typeof window.speak === 'function') {
    window.speak('Opening ' + (tune.name || 'tune'));
  }
}

function noMatchesFeedback(context, transcript) {
  const label = String(transcript || '').trim() || 'that';
  if (context.onFeedback) context.onFeedback('No matches for ' + label);
}

async function executeShow(query, context, transcriptLabel) {
  const displayTranscript = transcriptLabel || query;
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
    navigateToTune(context, candidates[0].tune);
    return { ok: true, tune: candidates[0].tune };
  }

  if (context.onDisambiguate) {
    const picked = await context.onDisambiguate(candidates.map(function(entry) {
      return entry.tune;
    }), cleaned);
    if (picked) {
      navigateToTune(context, picked);
      return { ok: true, tune: picked };
    }
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

  if (!isMeaningfulVoiceTranscript(transcript)) {
    noMatchesFeedback(context, transcript);
    return { ok: false };
  }

  const isSearch = result.tool === 'SEARCH' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isShow = result.tool === 'SHOW' && result.confidence >= VOICE_CONFIDENCE_THRESHOLD;
  const isOpenTool = result.tool === 'OPEN_TOOL';

  if (isOpenTool) {
    if (result.confidence >= VOICE_CONFIDENCE_THRESHOLD) {
      return executeOpenTool(result, context);
    }
    if (context.onFeedback) {
      context.onFeedback('Unknown tool — try metronome, tuner, chords, or keyboard');
    }
    return { ok: false };
  }

  if (isSearch) {
    return executeSearch(result, context);
  }

  if (isShow) {
    return executeShow(result.title || result.transcript, context, transcript);
  }

  if (hasSearchCueWords(result.transcript)) {
    if (context.onFeedback) context.onFeedback("Try saying 'search …' more clearly");
    return { ok: false };
  }

  return executeShow(result.transcript, context, transcript);
}
