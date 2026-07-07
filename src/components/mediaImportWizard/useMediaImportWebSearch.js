import { useState } from 'react';
import { searchChords } from '../../chordsSearchClient';
import { searchLyrics } from '../../lyricsSearchClient';
import { researchTuneBackground } from '../../tuneBackgroundResearchClient';
import { unwrapSearchResult } from '../../searchResultUtils';
import { useCancellableAsyncJob } from '../../useCancellableAsyncJob';
import { discoverComposerCandidatesIfNeeded } from '../../composerLookupUtils';
import { needsComposerDiscovery } from '../../composerDiscoveryUtils';
import { isGenericArtist } from '../../genericArtistUtils';

function formatSourceLabel(result) {
  if (!result || !result.source) return '';
  return result.sourceUrl
    ? result.source + ' (' + result.sourceUrl + ')'
    : result.source;
}

function pickLookupArtist(searchArtist, currentArtist) {
  const fromSearch = String(searchArtist || '').trim();
  if (fromSearch && !isGenericArtist(fromSearch)) return fromSearch;
  const fromCurrent = String(currentArtist || '').trim();
  if (fromCurrent && !isGenericArtist(fromCurrent)) return fromCurrent;
  return fromSearch || fromCurrent;
}

async function resolveComposerForLookup(options) {
  const {
    searchArtist,
    title,
    currentArtist,
    token,
    signal,
    resolverAvailable,
    onProgress,
    forceDiscover,
    deferApply,
  } = options;

  let lookupArtist = pickLookupArtist(searchArtist, currentArtist);
  if (!forceDiscover && !needsComposerDiscovery(lookupArtist)) {
    return { lookupArtist: lookupArtist, candidates: [] };
  }
  if (!title) {
    return { lookupArtist: lookupArtist, candidates: [] };
  }

  const candidates = await discoverComposerCandidatesIfNeeded({
    title: title,
    composer: lookupArtist,
    titleHint: title,
    accessToken: token,
    signal: signal,
    resolverAvailable: resolverAvailable,
    forceDiscover: forceDiscover,
    onProgress: onProgress,
  });

  if (deferApply && candidates.length > 0) {
    return { lookupArtist: '', candidates: candidates };
  }

  const discovered = candidates.find(function(candidate) {
    return candidate.source !== 'Current value';
  });
  return {
    lookupArtist: discovered ? discovered.artist : (lookupArtist || ''),
    candidates: [],
  };
}

async function searchChordsAndLyrics(options) {
  const { title, artist, token, signal, onProgress, resolverAvailable, abcTools, renderChords } = options;
  const searchOpts = {
    title: title,
    artist: artist,
    accessToken: token,
    signal: signal,
    resolverAvailable: resolverAvailable,
    abcTools: abcTools,
    renderChords: renderChords,
  };
  try {
    const chordResult = unwrapSearchResult(await searchChords(Object.assign({}, searchOpts, {
      onProgress: function(message, progress) {
        if (typeof onProgress === 'function') {
          onProgress(message || 'Searching for chords...', progress);
        }
      },
    })));
    return {
      chordText: chordResult.chordText || '',
      lyricLines: Array.isArray(chordResult.lyricLines) ? chordResult.lyricLines : [],
      artist: chordResult.artist || '',
      source: formatSourceLabel(chordResult),
      chordError: null,
    };
  } catch (chordError) {
    if (chordError && chordError.name === 'AbortError') throw chordError;
    const lyricResult = unwrapSearchResult(await searchLyrics(Object.assign({}, searchOpts, {
      onProgress: function(message, progress) {
        if (typeof onProgress === 'function') {
          onProgress(message || 'Searching for lyrics...', progress);
        }
      },
    })));
    return {
      chordText: '',
      lyricLines: Array.isArray(lyricResult.lines)
        ? lyricResult.lines
        : String(lyricResult.text || '').replace(/\r\n/g, '\n').split('\n'),
      artist: lyricResult.artist || '',
      source: formatSourceLabel(lyricResult),
      chordError: chordError,
    };
  }
}

async function runBackgroundLookup(options) {
  const { title, artist, token, signal, onProgress, canResearchBackground } = options;
  if (!canResearchBackground) {
    return { text: '', source: '', skipped: true };
  }
  try {
    const result = await researchTuneBackground({
      title: title,
      artist: artist,
      accessToken: token,
      signal: signal,
      onProgress: function(message, progress) {
        if (typeof onProgress === 'function') {
          onProgress(message || 'Researching background...', progress);
        }
      },
    });
    return {
      text: result.text || '',
      source: result.searchBackend
        ? 'Background research (' + result.searchBackend + ')'
        : 'Background research',
    };
  } catch (backgroundError) {
    if (backgroundError && backgroundError.name === 'AbortError') throw backgroundError;
    return { text: '', source: '', error: backgroundError };
  }
}

export function useMediaImportWebSearch(options) {
  const job = useCancellableAsyncJob('Media import search', {
    background: options.background !== false,
  });
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  function handleProgress(message, progress) {
    setProgressMessage(message || '');
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))));
    }
  }

  async function runLookup(mode) {
    const title = options.title;
    const artist = options.artist || '';
    const token = options.token;
    const canResearchBackground = options.canResearchBackground !== false;
    if (!title) return;

    if (job.busy) {
      job.cancel();
      return;
    }

    const ctx = job.begin();
    setError('');
    setSource('');
    if (mode === 'search') {
      setProgressMessage('Searching for chords and lyrics...');
    } else if (mode === 'background') {
      setProgressMessage('Researching background...');
    } else {
      setProgressMessage('Searching for chords, lyrics, and background...');
    }
    setProgressPercent(0);

    try {
      let searchResult = null;
      let backgroundResult = null;

      if (mode === 'search' || mode === 'full') {
        searchResult = await searchChordsAndLyrics({
          title: title,
          artist: artist,
          token: token,
          signal: ctx.signal,
          resolverAvailable: options.resolverAvailable,
          abcTools: options.abcTools,
          renderChords: options.renderChords,
          onProgress: function(message, progress) {
            if (!ctx.isCurrent()) return;
            handleProgress(message, progress);
          },
        });
      }

      if (mode === 'background' || mode === 'full') {
        backgroundResult = await runBackgroundLookup({
          title: title,
          artist: artist,
          token: token,
          signal: ctx.signal,
          canResearchBackground: canResearchBackground,
          onProgress: function(message, progress) {
            if (!ctx.isCurrent()) return;
            handleProgress(message, progress);
          },
        });
      }

      if (!ctx.isCurrent()) return;

      if (searchResult && searchResult.chordError && searchResult.chordError.message) {
        setError('Chords search failed (' + searchResult.chordError.message + '); lyrics were imported.');
      } else if (backgroundResult && backgroundResult.error && backgroundResult.error.message) {
        setError('Background research failed (' + backgroundResult.error.message + ').');
      } else if (mode === 'background' && backgroundResult && backgroundResult.skipped) {
        setError('Background research is not available on this resolver.');
      }

      if (mode === 'search') {
        if (!searchResult.chordText.trim() && searchResult.lyricLines.length === 0) {
          throw new Error('Search returned no chords or lyrics');
        }
      } else if (mode === 'background') {
        if (!backgroundResult || !backgroundResult.text || !backgroundResult.text.trim()) {
          throw new Error('Background research returned no info');
        }
      } else if (!searchResult.chordText.trim()
        && searchResult.lyricLines.length === 0
        && !(backgroundResult && backgroundResult.text && backgroundResult.text.trim())) {
        throw new Error('Search returned no chords, lyrics, or background info');
      }

      const resultsPatch = {};
      if (searchResult) {
        resultsPatch.lookupChordGridText = searchResult.chordText;
        resultsPatch.lookupLyricLines = searchResult.lyricLines;
        resultsPatch.lookupLyricSource = searchResult.source;
      }

      if (mode === 'search' || mode === 'full') {
        const composerLookup = await resolveComposerForLookup({
          searchArtist: searchResult ? searchResult.artist : '',
          title: title,
          currentArtist: artist,
          token: token,
          signal: ctx.signal,
          resolverAvailable: options.resolverAvailable,
          forceDiscover: mode === 'full',
          deferApply: true,
          onProgress: function(message, progress) {
            if (!ctx.isCurrent()) return;
            handleProgress(message || 'Discovering composer...', progress);
          },
        });
        if (composerLookup.candidates.length > 0) {
          resultsPatch.lookupComposerCandidates = composerLookup.candidates;
        } else if (composerLookup.lookupArtist) {
          resultsPatch.lookupArtist = composerLookup.lookupArtist;
        }
      }
      if (backgroundResult && backgroundResult.text) {
        resultsPatch.lookupBackgroundInfo = backgroundResult.text || '';
        resultsPatch.lookupBackgroundSource = backgroundResult.source || '';
      }

      if (typeof options.onResults === 'function') {
        options.onResults(resultsPatch);
      }
      if (typeof options.onBackgroundResults === 'function') {
        options.onBackgroundResults(resultsPatch);
      }

      const sourceParts = [];
      if (searchResult && searchResult.source) sourceParts.push(searchResult.source);
      if (backgroundResult && backgroundResult.source) sourceParts.push(backgroundResult.source);
      setSource(sourceParts.join('; '));
      setProgressPercent(100);
    } catch (e) {
      if (job.isAbortError(e)) return;
      setError(e && e.message ? e.message : 'Lookup failed');
    } finally {
      job.finish(ctx.generation);
      if (ctx.isCurrent()) {
        setProgressMessage('');
      }
    }
  }

  function runSearch() {
    return runLookup('search');
  }

  function runBackgroundResearch() {
    return runLookup('background');
  }

  function runFullLookup() {
    return runLookup('full');
  }

  function cancelSearch() {
    job.cancel();
  }

  return {
    busy: job.busy,
    error: error,
    source: source,
    progressMessage: progressMessage,
    progressPercent: progressPercent,
    runSearch: runSearch,
    runBackgroundResearch: runBackgroundResearch,
    runFullLookup: runFullLookup,
    cancelSearch: cancelSearch,
  };
}
