import { useState } from 'react';
import { searchChords } from '../../chordsSearchClient';
import { searchLyrics } from '../../lyricsSearchClient';
import { unwrapSearchResult } from '../../searchResultUtils';
import { useCancellableAsyncJob } from '../../useCancellableAsyncJob';

export function useMediaImportWebSearch(options) {
  const job = useCancellableAsyncJob();
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

  async function runSearch() {
    const title = options.title;
    const artist = options.artist || '';
    const token = options.token;
    if (!title) return;

    if (job.busy) {
      job.cancel();
      return;
    }

    const ctx = job.begin();
    setError('');
    setSource('');
    setProgressMessage('Searching for chords and lyrics...');
    setProgressPercent(0);

    try {
      let chordText = '';
      let lyricLines = [];
      let sourceLabel = '';

      try {
        const chordResult = unwrapSearchResult(await searchChords({
          title: title,
          artist: artist,
          accessToken: token,
          signal: ctx.signal,
          onProgress: function(message, progress) {
            if (!ctx.isCurrent()) return;
            handleProgress(message || 'Searching for chords...', progress);
          },
        }));
        if (!ctx.isCurrent()) return;
        chordText = chordResult.chordText || '';
        lyricLines = Array.isArray(chordResult.lyricLines) ? chordResult.lyricLines : [];
        sourceLabel = chordResult.source
          ? (chordResult.sourceUrl ? chordResult.source + ' (' + chordResult.sourceUrl + ')' : chordResult.source)
          : '';
      } catch (chordError) {
        if (job.isAbortError(chordError)) throw chordError;
        if (!ctx.isCurrent()) return;
        setProgressMessage('Searching for lyrics...');
        setProgressPercent(0);
        const lyricResult = unwrapSearchResult(await searchLyrics({
          title: title,
          artist: artist,
          accessToken: token,
          signal: ctx.signal,
          onProgress: function(message, progress) {
            if (!ctx.isCurrent()) return;
            handleProgress(message || 'Searching for lyrics...', progress);
          },
        }));
        if (!ctx.isCurrent()) return;
        lyricLines = Array.isArray(lyricResult.lines)
          ? lyricResult.lines
          : String(lyricResult.text || '').replace(/\r\n/g, '\n').split('\n');
        sourceLabel = lyricResult.source
          ? (lyricResult.sourceUrl ? lyricResult.source + ' (' + lyricResult.sourceUrl + ')' : lyricResult.source)
          : '';
        if (chordError && chordError.message) {
          setError('Chords search failed (' + chordError.message + '); lyrics were imported.');
        }
      }

      if (!chordText.trim() && lyricLines.length === 0) {
        throw new Error('Search returned no chords or lyrics');
      }

      if (typeof options.onResults === 'function') {
        options.onResults({
          chordGridText: chordText,
          lookupLyricLines: lyricLines,
        });
      }
      setSource(sourceLabel);
      setProgressPercent(100);
    } catch (e) {
      if (job.isAbortError(e)) return;
      setError(e && e.message ? e.message : 'Search failed');
    } finally {
      job.finish(ctx.generation);
      if (ctx.isCurrent()) {
        setProgressMessage('');
      }
    }
  }

  return {
    busy: job.busy,
    error: error,
    source: source,
    progressMessage: progressMessage,
    progressPercent: progressPercent,
    runSearch: runSearch,
  };
}
