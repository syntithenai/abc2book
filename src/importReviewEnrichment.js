import { searchChords } from './chordsSearchClient';
import { searchLyrics } from './lyricsSearchClient';
import { researchTuneBackground } from './tuneBackgroundResearchClient';
import { unwrapSearchResult } from './searchResultUtils';
import {
  analyzeMediaFromSource,
  formatMediaAnalysisForTune,
} from './mediaAnalysisClient';
import { buildTimedModelsFromAnalysis } from './mediaAnalysisModels';
import { prepareMediaAnalysisSource } from './prepareMediaAnalysisSource';
import { getLinkedMediaSources } from './mediaTranscriptionSources';
import { createWizardDraft, applyAnalysisToDraft } from './mediaImportWizardState';
import { finishMediaImportWizard } from './mediaImportWizardFinish';
import {
  buildAnalysisProcessingPayload,
  loadMelodyProcessingSettings,
} from './melodyProcessingSettings';
import { isAbortError } from './abortUtils';
import { discoverComposerCandidatesIfNeeded } from './composerLookupUtils';
import { needsComposerDiscovery } from './composerDiscoveryUtils';
import { isGenericArtist } from './genericArtistUtils';
import { capitalizeSongTitle } from './titleCaseUtils';
import { primaryArtist } from './tuneBibliographicUtils';
import { lyricLinesToText } from './wLinesUtils';
import { isTuneFieldEmptyForKind } from './fieldLookupApplyUtils';
import { enrichTuneMetadataFromMusicBrainz } from './tuneMetadataEnhance';

async function searchChordsAndLyrics(options) {
  const {
    title,
    artist,
    token,
    signal,
    onProgress,
    resolverAvailable,
    abcTools,
    renderChords,
    skipChords,
    skipLyrics,
  } = options;
  const searchOpts = {
    title: title,
    artist: artist,
    accessToken: token,
    signal: signal,
    resolverAvailable: resolverAvailable,
    abcTools: abcTools,
    renderChords: renderChords,
  };

  if (skipChords && skipLyrics) {
    return { chordText: '', lyricLines: [], artist: '' };
  }

  if (!skipChords) {
    try {
      const chordResult = unwrapSearchResult(await searchChords(Object.assign({}, searchOpts, {
        onProgress: function(message, progress) {
          if (typeof onProgress === 'function') {
            onProgress(message || 'Searching for chords...', progress);
          }
        },
      })));
      const lyricLines = Array.isArray(chordResult.lyricLines) ? chordResult.lyricLines : [];
      if (lyricLines.length > 0 || skipLyrics) {
        return {
          chordText: chordResult.chordText || '',
          lyricLines: skipLyrics ? [] : lyricLines,
          artist: chordResult.artist || '',
        };
      }
      // Chords found without lyrics: still return chords; fall through for lyrics if needed.
      if (chordResult.chordText) {
        if (skipLyrics) {
          return {
            chordText: chordResult.chordText || '',
            lyricLines: [],
            artist: chordResult.artist || '',
          };
        }
        try {
          const lyricResult = unwrapSearchResult(await searchLyrics(Object.assign({}, searchOpts, {
            onProgress: function(message, progress) {
              if (typeof onProgress === 'function') {
                onProgress(message || 'Searching for lyrics...', progress);
              }
            },
          })));
          return {
            chordText: chordResult.chordText || '',
            lyricLines: Array.isArray(lyricResult.lines)
              ? lyricResult.lines
              : String(lyricResult.text || '').replace(/\r\n/g, '\n').split('\n'),
            artist: chordResult.artist || lyricResult.artist || '',
          };
        } catch (lyricError) {
          if (lyricError && lyricError.name === 'AbortError') throw lyricError;
          return {
            chordText: chordResult.chordText || '',
            lyricLines: [],
            artist: chordResult.artist || '',
          };
        }
      }
    } catch (chordError) {
      if (chordError && chordError.name === 'AbortError') throw chordError;
    }
  }

  if (skipLyrics) {
    return { chordText: '', lyricLines: [], artist: '' };
  }

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
  };
}

export async function enrichImportCandidate(candidate, options) {
  if (!candidate || !candidate.tune) {
    throw new Error('Missing import candidate');
  }

  const tunebook = options.tunebook;
  const abcjsParser = options.abcjsParser;
  const token = options.accessToken;
  const signal = options.signal;
  const onProgress = options.onProgress || function() {};

  const tune = JSON.parse(JSON.stringify(candidate.tune));
  if (tune.name) {
    tune.name = capitalizeSongTitle(tune.name);
  }
  const title = tune.name || '';
  const artist = primaryArtist(tune);

  let draft = createWizardDraft(tune);
  try {
    draft.baseTuneAbc = tunebook.abcTools.json2abc(tune);
    const existingChords = abcjsParser.renderChords(draft.baseTuneAbc, true) || '';
    draft.existingChordGridText = existingChords;
    draft.chordGridText = existingChords;
    const existingNotes = tunebook.abcTools.justNotes(draft.baseTuneAbc) || '';
    draft.existingMelodyNotesText = existingNotes;
    draft.melodyNotesText = existingNotes;
  } catch (e) {
    draft.baseTuneAbc = '';
  }

  onProgress('Searching for chords, lyrics, and background…', 0.1);
  const hasBackground = !!(typeof tune.backgroundInfo === 'string' && tune.backgroundInfo.trim());
  const backgroundPromise = token && !hasBackground
    ? researchTuneBackground({
      title: title,
      artist: artist,
      backgroundInfo: typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : '',
      accessToken: token,
      signal: signal,
      onProgress: function(message, progress) {
        onProgress(message || 'Researching background…', 0.15 + (progress || 0) * 0.15);
      },
    }).then(function(result) {
      return result.text || '';
    }).catch(function(err) {
      if (err && err.name === 'AbortError') throw err;
      return '';
    })
    : Promise.resolve('');

  const chordsFilled = !isTuneFieldEmptyForKind(tune, 'chords');
  const lyricsFilled = !!String(lyricLinesToText(tune) || '').trim();
  const searchResult = (chordsFilled && lyricsFilled)
    ? { chordText: '', lyricLines: [], artist: '' }
    : await searchChordsAndLyrics({
      title: title,
      artist: artist,
      token: token,
      signal: signal,
      resolverAvailable: options.resolverAvailable,
      abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      renderChords: abcjsParser && typeof abcjsParser.renderChords === 'function'
        ? function(abc) { return abcjsParser.renderChords(abc, true) }
        : null,
      skipChords: chordsFilled,
      skipLyrics: lyricsFilled,
      onProgress: function(message, progress) {
        onProgress(message || 'Searching…', 0.1 + (progress || 0) * 0.2);
      },
    });
  const lookupBackgroundInfo = await backgroundPromise;

  let composerCandidates = [];
  const searchArtist = String(searchResult.artist || '').trim();
  if (searchArtist && !isGenericArtist(searchArtist) && needsComposerDiscovery(tune.composer)) {
    tune.composer = searchArtist;
  }

  onProgress('Discovering metadata…', 0.32);
  await enrichTuneMetadataFromMusicBrainz(tune, {
    title: title,
    artist: tune.composer || artist,
    accessToken: token,
    signal: signal,
    resolverAvailable: options.resolverAvailable,
    onProgress: function(step, message) {
      onProgress(message || step || 'Discovering metadata…', 0.32 + 0.08);
    },
  });

  if (needsComposerDiscovery(tune.composer)) {
    composerCandidates = await discoverComposerCandidatesIfNeeded({
      title: title,
      composer: tune.composer || '',
      titleHint: title,
      accessToken: token,
      signal: signal,
      resolverAvailable: options.resolverAvailable,
      forceDiscover: true,
      onProgress: function(message, progress) {
        onProgress(message || 'Discovering artist…', 0.4 + (progress || 0) * 0.05);
      },
    });
  }

  draft.lookupChordGridText = searchResult.chordText || '';
  draft.lookupLyricLines = searchResult.lyricLines || [];
  draft.lookupBackgroundInfo = lookupBackgroundInfo;
  draft.explicitImports = true;

  if (searchResult.lyricLines.length > 0) {
    draft.lyricLines = searchResult.lyricLines;
    draft.lyricsExplicitlyImported = true;
  }
  if (lookupBackgroundInfo.trim()) {
    draft.metadata = Object.assign({}, draft.metadata || {}, {
      backgroundInfo: lookupBackgroundInfo.trim(),
    });
  }
  if (searchResult.chordText.trim()) {
    draft.chordGridText = searchResult.chordText.trim();
  }

  const sources = getLinkedMediaSources(tune, tunebook);
  if (sources.length > 0 && options.canAnalyzeMedia) {
    onProgress('Analyzing linked media…', 0.45);
    try {
      const source = await prepareMediaAnalysisSource(sources[0], tune, {
        accessToken: token,
        driveApi: options.driveApi,
      });
      const raw = await analyzeMediaFromSource({
        source: source,
        accessToken: token,
        signal: signal,
        processing: buildAnalysisProcessingPayload(loadMelodyProcessingSettings()),
        onProgress: function(message, progress) {
          const pct = typeof progress === 'number' ? progress / 100 : 0;
          onProgress(message || 'Analyzing…', 0.45 + pct * 0.45);
        },
      });
      const timed = buildTimedModelsFromAnalysis(raw, tune, tunebook);
      const formatted = formatMediaAnalysisForTune(raw, tune, tunebook);
      draft = applyAnalysisToDraft(draft, {
        version: Date.now(),
        raw: raw,
        timed: timed,
        formatted: formatted,
      }, tunebook);
      if (draft.analyzedChordGridText && draft.analyzedChordGridText.trim()) {
        draft.chordGridText = draft.analyzedChordGridText;
      }
      if (draft.analyzedMelodyNotesText && draft.analyzedMelodyNotesText.trim()) {
        draft.melodyNotesText = draft.analyzedMelodyNotesText;
      }
    } catch (analysisError) {
      if (!isAbortError(analysisError)) {
        console.log(analysisError);
      } else {
        throw analysisError;
      }
    }
  }

  onProgress('Finalizing enriched tune…', 0.95);
  const enrichedTune = await finishMediaImportWizard({
    tune: tune,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
    draft: draft,
    skipSave: true,
  });
  return {
    tune: enrichedTune,
    composerCandidates: composerCandidates,
  };
}
