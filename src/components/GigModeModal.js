import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import abcjs from 'abcjs';
import TimedLyricsChordsView from './TimedLyricsChordsView';
import LyricsStructureSyncPanel from './LyricsStructureSyncPanel';
import LyricsAutoscrollModal from './LyricsAutoscrollModal';
import ViewModeSelectorModal from './ViewModeSelectorModal';
import usePerformanceKeyBindings from '../usePerformanceKeyBindings';
import useAbcjsParser from '../useAbcjsParser';
import {
  clampGigZoom,
  getTuneGigZoom,
  getGigNightMode,
  toggleGigNightMode,
} from '../gigDisplaySettings';
import {
  applyCompactScreenNotationMeta,
  buildGigNotationRenderOptions,
  findStaffWidthForVerticalFit,
  fitNotationSvg,
  fitNotationToWidth,
  getRenderDimensions,
  measureNotationPaper,
  NOTATION_FIT_VERTICAL,
} from '../gigNotationFit';
import {
  normalizeViewMode,
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
  defaultViewModeForTune,
  getAvailableDisplayFlags,
} from '../viewModeUtils';
import { resolveTuneDisplayLayout, isViewModesEmpty, isStructureOnlyLayout } from '../tuneDisplayLayout';
import { getTuneNotationFitMode, setNotationFitMode } from '../notationFitSettings';
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay';
import {
  buildAbcWithNoteSpacing,
} from '../noteSpacingUtils';
import { prepareGigStaffDisplayAbc } from '../notation/notationDisplayAbc';
import { isSectionMarkerChordName } from '../chordSheetUtils';
import { filterTuneVoices } from '../abcVoiceFilter';
import { getTuneVoiceKeys, getVisibleVoiceKeys } from '../abcVoiceViewSettings';
import { buildGigRoute, getPlaylistTuneIdAtIndex } from '../gigRouteUtils';
import MarkdownContent from './MarkdownContent';
import LyricsZoomControls from './LyricsZoomControls';
import StructureChordBlock from './StructureChordBlock';
import StructureCapoControl from './StructureCapoControl';
import ChordPitchButton from './ChordPitchButton';
import { useCapoViewState } from '../useCapoViewState';
import { chordTransposeWithCapo } from '../capoViewUtils';
import useNotationPlaybackCursor from '../useNotationPlaybackCursor';
import './GigModeModal.css';

function requestWakeLock() {
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return null;
  return navigator.wakeLock.request('screen').catch(function() { return null; });
}

export default function GigModeModal(props) {
  const navigate = useNavigate();
  const tunebook = props.tunebook;
  const setPlaylist = props.setPlaylist;
  const tunes = props.tunes || {};
  const abcjsParser = useAbcjsParser();
  const gigBodyRef = useRef(null);
  const notationColRef = useRef(null);
  const notationRef = useRef(null);
  const lastNotationChordRef = useRef('');
  const notationFitSizeRef = useRef({ width: 0, height: 0 });
  const [cursorVisualObj, setCursorVisualObj] = useState(null);
  const [showSetList, setShowSetList] = useState(false);
  const [fontScale, setFontScale] = useState(1.2);
  const [edgeMessage, setEdgeMessage] = useState('');
  const [viewMode, setViewMode] = useState('music');
  const [notationFitMode, setNotationFitModeState] = useState(function() {
    return getTuneNotationFitMode(null);
  });
  const [voiceSettingsVersion, setVoiceSettingsVersion] = useState(0);
  const [gigNightMode, setGigNightModeState] = useState(getGigNightMode);

  const currentIndex = setPlaylist && typeof setPlaylist.currentIndex === 'number'
    ? setPlaylist.currentIndex
    : 0;
  const playlistTunes = setPlaylist && Array.isArray(setPlaylist.tunes) ? setPlaylist.tunes : [];
  const playlistTune = playlistTunes[currentIndex] || null;
  const currentTune = playlistTune && playlistTune.id && tunes[playlistTune.id]
    ? tunes[playlistTune.id]
    : playlistTune;
  const setItem = setPlaylist && Array.isArray(setPlaylist.items)
    ? setPlaylist.items[currentIndex] || null
    : null;

  const activeTuneNote = setItem && setItem.note ? String(setItem.note).trim() : '';

  function persistGigTuneSettings(patch) {
    if (!currentTune || !currentTune.id || !tunebook) return;
    tunebook.saveTune(
      Object.assign({}, currentTune, { id: currentTune.id }, patch),
      false,
      { skipHistory: true }
    );
  }

  useEffect(function() {
    if (!props.show || !currentTune) return;
    setFontScale(getTuneGigZoom(currentTune));
    setNotationFitModeState(getTuneNotationFitMode(currentTune));
  }, [props.show, currentTune && currentTune.id, currentTune && currentTune.zoom, currentTune && currentTune.notationFit]);

  function focusGigBody() {
    const bodyEl = gigBodyRef.current;
    if (bodyEl && typeof bodyEl.focus === 'function') {
      bodyEl.focus({ preventScroll: true });
    }
  }

  useEffect(function() {
    if (!props.show) return undefined;
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false);
    setEdgeMessage('');
    setShowSetList(false);
    var initialMode = 'music';
    if (setItem && setItem.viewMode) {
      initialMode = normalizeViewMode(setItem.viewMode);
    } else if (currentTune && currentTune.viewMode) {
      initialMode = normalizeViewMode(currentTune.viewMode);
    } else if (currentTune) {
      const hasChordsForDefault = tuneHasExplicitChords(currentTune, tunebook, abcjsParser);
      initialMode = defaultViewModeForTune(currentTune, tunebook, { hasChords: hasChordsForDefault });
    }
    setViewMode(initialMode);
    let wakeLock = null;
    requestWakeLock().then(function(lock) { wakeLock = lock; });
    const focusTimer = window.setTimeout(focusGigBody, 0);
    return function() {
      window.clearTimeout(focusTimer);
      if (wakeLock && wakeLock.release) wakeLock.release().catch(function() {});
    };
  }, [props.show, currentTune && currentTune.id, setItem && setItem.viewMode]);

  useEffect(function() {
    if (!props.show || showSetList) return undefined;
    const focusTimer = window.setTimeout(focusGigBody, 0);
    return function() {
      window.clearTimeout(focusTimer);
    };
  }, [props.show, showSetList, currentIndex]);

  const tuneTranspose = useMemo(function() {
    if (!currentTune) return 0;
    return Number(currentTune.transpose) || 0;
  }, [currentTune, currentTune && currentTune.transpose]);

  const storedCapo = useMemo(function() {
    if (!currentTune) return 0;
    const baseCapo = Number(currentTune.capo) || 0;
    return setItem && setItem.capo != null ? Number(setItem.capo) : baseCapo;
  }, [currentTune, setItem]);

  const capoState = useCapoViewState(currentTune && currentTune.id, storedCapo);

  const chordTranspose = useMemo(function() {
    if (!currentTune) return 0;
    const baseTranspose = Number(currentTune.transpose) || 0;
    const itemTranspose = setItem && setItem.transpose != null ? Number(setItem.transpose) : 0;
    const totalTranspose = baseTranspose + itemTranspose;
    return chordTransposeWithCapo(totalTranspose, capoState.capoOffset, capoState.capoEnabled);
  }, [currentTune, setItem, capoState.capoOffset, capoState.capoEnabled]);

  // Capo only changes chord fingering names — notation stays on sounding transpose.
  const notationVisualTranspose = useMemo(function() {
    if (!currentTune) return 0;
    const baseTranspose = Number(currentTune.transpose) || 0;
    const itemTranspose = setItem && setItem.transpose != null ? Number(setItem.transpose) : 0;
    return baseTranspose + itemTranspose;
  }, [currentTune, setItem]);

  const structureMelodyNoteLines = useMemo(function() {
    if (!currentTune || !currentTune.voices || Object.keys(currentTune.voices).length === 0) return [];
    const firstVoice = Object.values(currentTune.voices)[0];
    return firstVoice && Array.isArray(firstVoice.notes) ? firstVoice.notes : [];
  }, [currentTune]);

  const melodyChordChart = useMemo(function() {
    if (!currentTune || !tunebook) return '';
    try {
      return abcjsParser.renderChords(
        tunebook.abcTools.emptyABC(currentTune.name) + structureMelodyNoteLines.join('\n'),
        false,
        chordTranspose,
        currentTune.key,
        currentTune.noteLength,
        currentTune.meter
      ) || '';
    } catch (e) {
      return '';
    }
  }, [currentTune, tunebook, abcjsParser, chordTranspose, structureMelodyNoteLines]);

  const hasAbcChords = useMemo(function() {
    if (!currentTune || !tunebook) return false;
    const firstVoice = currentTune.voices && Object.keys(currentTune.voices).length > 0
      ? Object.values(currentTune.voices)[0]
      : { notes: [] };
    return tunebook.abcTools.hasChords((firstVoice.notes || []).join('\n'));
  }, [currentTune, tunebook]);

  useEffect(function() {
    lastNotationChordRef.current = '';
  }, [currentTune && currentTune.id]);

  const handleNotationChordClick = useCallback(function(abcelem) {
    if (abcelem && Array.isArray(abcelem.chord) && abcelem.chord.length > 0) {
      const name = String(abcelem.chord[0].name || '')
        .replace(/♭/g, 'b')
        .replace(/♯/g, '#');
      if (name && !isSectionMarkerChordName(name)) {
        lastNotationChordRef.current = name;
      }
    }
  }, []);

  const hasNotes = !!(currentTune && tunebook && tunebook.hasNotes && tunebook.hasNotes(currentTune));
  const hasChords = !!currentTune && tuneHasExplicitChords(currentTune, tunebook, abcjsParser);
  const availableFlags = useMemo(function() {
    if (!currentTune) {
      return { notation: true, lyrics: true, structure: true, chords: true, info: true };
    }
    return getAvailableDisplayFlags(currentTune, tunebook, {
      hasChords: hasChords,
      hasInfo: !!(currentTune.backgroundInfo && String(currentTune.backgroundInfo).trim()),
    });
  }, [currentTune, tunebook, hasChords]);
  const displayFlags = useMemo(function() {
    if (!currentTune) {
      return viewModeToDisplayFlags(viewMode);
    }
    return resolveDisplayFlagsForTune(
      viewModeToDisplayFlags(viewMode),
      currentTune,
      tunebook,
      { hasChords: hasChords }
    );
  }, [viewMode, currentTune, tunebook, hasChords]);
  const layout = useMemo(function() {
    return resolveTuneDisplayLayout(displayFlags);
  }, [displayFlags]);
  const showLyrics = !!displayFlags.lyrics;
  const showStructure = !!displayFlags.structure && hasChords;
  const showChordsAnnotate = !!displayFlags.chords;
  const showInfo = !!displayFlags.info;
  const showNotation = displayFlags.notation !== 'off' && hasNotes;
  const viewModesEmpty = isViewModesEmpty(displayFlags, availableFlags);
  const hideChordsInText = !showChordsAnnotate;
  const visibleVoiceKeys = useMemo(function() {
    if (!currentTune) return [];
    return getVisibleVoiceKeys(currentTune.id, getTuneVoiceKeys(currentTune));
  }, [currentTune, voiceSettingsVersion]);

  const staffAbc = useMemo(function() {
    if (!showNotation || !currentTune || !tunebook) return '';
    const notationTune = filterTuneVoices(currentTune, visibleVoiceKeys);
    const displayAbc = buildAbcWithNoteSpacing(notationTune, tunebook.abcTools, { includeLyrics: false });
    return prepareGigStaffDisplayAbc(displayAbc, tunebook, showChordsAnnotate);
  }, [showNotation, currentTune, tunebook, showChordsAnnotate, visibleVoiceKeys]);

  useNotationPlaybackCursor({
    enabled: props.show && showNotation && !!props.mediaController,
    containerRef: notationRef,
    visualObj: cursorVisualObj,
    mediaController: props.mediaController,
    displayTuneId: currentTune && currentTune.id,
    tempoFactor: props.mediaController && props.mediaController.playbackSpeed,
  });

  function handleViewModeChange(mode) {
    const nextMode = normalizeViewMode(mode);
    setViewMode(nextMode);
    if (currentTune && currentTune.id) {
      persistGigTuneSettings({ viewMode: nextMode });
    }
  }

  function handleNotationFitModeChange(mode) {
    const next = setNotationFitMode(mode);
    setNotationFitModeState(next);
    if (currentTune && currentTune.id) {
      persistGigTuneSettings({ notationFit: next });
    }
  }

  const renderNotation = useCallback(function() {
    if (!props.show || !showNotation || !notationRef.current || !currentTune || !tunebook) return;
    const colEl = notationColRef.current;
    if (!colEl) return;

    function runRender(attempt) {
      const paperEl = colEl.querySelector('.gig-mode-notation-paper');
      const measureEl = paperEl || colEl;
      const renderEl = notationRef.current;
      if (!renderEl) return;
      const useVerticalFit = notationFitMode === NOTATION_FIT_VERTICAL;
      const paper = measureNotationPaper(measureEl, renderEl);
      const minReady = useVerticalFit ? paper.availH : paper.availW;
      if (minReady < 150 && attempt < 8) {
        requestAnimationFrame(function() { runRender(attempt + 1); });
        return;
      }

      const renderOptions = Object.assign({}, buildGigNotationRenderOptions(notationVisualTranspose), {
        clickListener: handleNotationChordClick,
        afterParsing: applyCompactScreenNotationMeta,
      });

      if (!staffAbc) return;

      function renderAtStaffWidth(staffWidth) {
        renderEl.innerHTML = '';
        const rendered = abcjs.renderAbc(renderEl, staffAbc, Object.assign({}, renderOptions, {
          staffwidth: staffWidth,
        }));
        const svg = renderEl.querySelector('svg');
        if (!svg) return null;
        const dims = getRenderDimensions(svg);
        if (!(dims.width > 0) || !(dims.height > 0)) return null;
        return {
          svg: svg,
          dims: dims,
          visual: rendered && rendered.length > 0 ? rendered[0] : null,
        };
      }

      function finishRender() {
        try {
          const livePaper = measureNotationPaper(paperEl, renderEl);
          let rendered;
          if (useVerticalFit) {
            const fit = findStaffWidthForVerticalFit(function(staffWidth) {
              return renderAtStaffWidth(staffWidth);
            }, paper.availW, paper.availH, paper.availW);
            rendered = renderAtStaffWidth(fit.staffWidth);
            if (!rendered || !rendered.svg) return;
            fitNotationSvg(rendered.svg, renderEl, paperEl, notationFitMode);
          } else {
            rendered = renderAtStaffWidth(paper.availW);
            if (!rendered || !rendered.svg) return;
            fitNotationToWidth(rendered.svg, renderEl, livePaper.availW);
          }
          notationFitSizeRef.current = {
            width: livePaper.availW,
            height: livePaper.availH,
          };
          setCursorVisualObj(rendered && rendered.visual ? rendered.visual : null);
        } catch (e) {
          console.log('gig notation render', e);
          setCursorVisualObj(null);
        }
      }

      const fontsReady = typeof document !== 'undefined' && document.fonts && document.fonts.ready;
      if (fontsReady && typeof fontsReady.then === 'function') {
        fontsReady.then(function() {
          requestAnimationFrame(finishRender);
        });
      } else {
        requestAnimationFrame(finishRender);
      }
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() { runRender(0); });
    });
  }, [props.show, currentTune, showNotation, showChordsAnnotate, notationFitMode, notationVisualTranspose, tunebook, visibleVoiceKeys, voiceSettingsVersion, handleNotationChordClick, staffAbc]);

  useEffect(function() {
    renderNotation();
  }, [renderNotation]);

  useEffect(function() {
    if (!props.show || !showNotation || !notationColRef.current) return undefined;
    const colEl = notationColRef.current;
    let resizeTimer = null;

    function scheduleRender() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        notationFitSizeRef.current = { width: 0, height: 0 };
        renderNotation();
      }, 80);
    }

    const observer = new ResizeObserver(scheduleRender);
    observer.observe(colEl);
    window.addEventListener('resize', scheduleRender);

    return function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener('resize', scheduleRender);
    };
  }, [props.show, showNotation, renderNotation, currentTune && currentTune.id, notationFitMode]);

  function goToIndex(nextIndex) {
    if (!setPlaylist || !props.setSetPlaylist) return;
    if (nextIndex < 0 || nextIndex >= playlistTunes.length) return;
    const next = Object.assign({}, setPlaylist, { currentIndex: nextIndex });
    props.setSetPlaylist(next);
    setEdgeMessage('');
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false);
    const tuneId = getPlaylistTuneIdAtIndex(next, nextIndex);
    if (setPlaylist.setId && tuneId) {
      navigate(buildGigRoute(setPlaylist.setId, tuneId), { replace: true });
    }
  }

  function handleNext() {
    if (!setPlaylist) return;
    if (currentIndex >= playlistTunes.length - 1) {
      setEdgeMessage('End of set');
      return;
    }
    goToIndex(currentIndex + 1);
  }

  function handlePrevious() {
    if (!setPlaylist) return;
    if (currentIndex <= 0) {
      setEdgeMessage('Start of set');
      return;
    }
    goToIndex(currentIndex - 1);
  }

  const onAtSetEnd = useCallback(function() {
    if (!setPlaylist) return false;
    if (currentIndex < playlistTunes.length - 1) return false;
    setEdgeMessage('End of set');
    return true;
  }, [setPlaylist, currentIndex, playlistTunes.length]);

  const onAtSetStart = useCallback(function() {
    if (!setPlaylist) return false;
    if (currentIndex > 0) return false;
    setEdgeMessage('Start of set');
    return true;
  }, [setPlaylist, currentIndex]);

  usePerformanceKeyBindings({
    enabled: !!props.show && !showSetList,
    ignoreGlobalBlock: true,
    allowButtonTargets: true,
    useCapture: true,
    activeModalSelector: '.gig-mode-modal',
    musicSingleSelector: '.gig-mode-body',
    onNextTune: handleNext,
    onPreviousTune: handlePrevious,
    onAtSetEnd: onAtSetEnd,
    onAtSetStart: onAtSetStart,
  });

  function handleClose() {
    if (props.setSetPlaylist) props.setSetPlaylist(null);
    if (props.onClose) props.onClose();
  }

  function changeFontScale(next) {
    const clamped = clampGigZoom(next);
    setFontScale(clamped);
    persistGigTuneSettings({ zoom: clamped });
  }

  function changeTuneTranspose(delta) {
    if (!currentTune || !currentTune.id || !tunebook) return;
    const next = tuneTranspose + delta;
    tunebook.saveTune(Object.assign({}, currentTune, {
      id: currentTune.id,
      transpose: next,
    }));
  }

  function handleCapoOffsetChange(offset) {
    capoState.applyCapoOffset(offset);
    if (!currentTune || !currentTune.id || !tunebook) return;
    tunebook.saveTune(Object.assign({}, currentTune, {
      id: currentTune.id,
      capo: offset,
    }));
  }

  function handleToggleDarkTheme() {
    const next = toggleGigNightMode();
    setGigNightModeState(next);
  }

  const isDarkTheme = gigNightMode;

  const nextTune = playlistTunes[currentIndex + 1];
  const setlistTitle = setPlaylist && setPlaylist.name ? setPlaylist.name : '';
  const progressLabel = playlistTunes.length > 0
    ? (currentIndex + 1) + ' / ' + playlistTunes.length
      + (nextTune && nextTune.name ? ' — next: ' + nextTune.name : '')
    : '0 / 0';
  const displayZoom = fontScale;
  const showLyricsContent = !!showLyrics;
  const infoOnlyFullPage = showInfo && !showNotation && !showLyrics && !showStructure;
  const fitHeightOn = notationFitMode === NOTATION_FIT_VERTICAL;
  const syncLyricsStructure = !!layout.syncLyricsStructure;
  const lyricsStructureFitHeight = fitHeightOn && !showNotation && syncLyricsStructure;
  const lyricsFitHeight = fitHeightOn && !showNotation && showLyrics && !syncLyricsStructure;
  const structureOnlyView = showStructure && !syncLyricsStructure && isStructureOnlyLayout(displayFlags);
  const structureFitHeight = showStructure && !syncLyricsStructure;
  const structureFitHeightGrow = structureOnlyView;

  const structureChordChart = melodyChordChart;

  const lyricsStructurePanel = currentTune && syncLyricsStructure ? (
    <div className="tune-panel-lyrics-structure-sync tune-panel-lyrics tune-slot-main">
      <LyricsStructureSyncPanel
        tune={currentTune}
        tunebook={tunebook}
        chordTranspose={chordTranspose}
        hideChords={hideChordsInText}
        zoom={displayZoom}
        fitHeight={lyricsStructureFitHeight}
        chords={structureChordChart}
        melodyNoteLines={structureMelodyNoteLines}
        showCapoControl={false}
        capoOffset={capoState.capoOffset}
        capoEnabled={capoState.capoEnabled}
        onCapoToggle={capoState.toggleCapo}
        onCapoOffsetChange={handleCapoOffsetChange}
      />
    </div>
  ) : null;

  const lyricsPanel = currentTune && showLyricsContent && !syncLyricsStructure ? (
    <div className={`music-view-lyrics tune-panel-lyrics lyrics-zoom-host${layout.main === 'lyrics' ? ' tune-slot-main' : ''}${layout.side === 'lyrics' ? ' tune-slot-side' : ''}${layout.below === 'lyrics' ? ' tune-slot-below' : ''}${layout.wrapLyricsAroundStructure ? ' tune-lyrics-wrap' : ''}`} style={{ fontSize: displayZoom + 'em' }}>
      <TimedLyricsChordsView
        tune={currentTune}
        tunebook={tunebook}
        chordTranspose={chordTranspose}
        hideChords={hideChordsInText}
        suppressLeadingTitle={true}
        inheritZoom={true}
        fitHeight={lyricsFitHeight}
      />
    </div>
  ) : null;

  const structurePanel = currentTune && showStructure && !syncLyricsStructure ? (
    <div className={`music-chords-block-col tune-panel-structure${layout.main === 'structure' ? ' tune-slot-main' : ''}${layout.side === 'structure' ? ' tune-slot-side' : ''}${!showNotation && !showLyrics ? ' music-chords-block-col--full-page' : ''}`}>
      <StructureChordBlock
        chords={structureChordChart}
        tune={currentTune}
        melodyNoteLines={structureMelodyNoteLines}
        chordTranspose={chordTranspose}
        fitHeight={structureFitHeight}
        fitHeightGrow={structureFitHeightGrow}
        showCapoControl={false}
        capoOffset={capoState.capoOffset}
        capoEnabled={capoState.capoEnabled}
        onCapoToggle={capoState.toggleCapo}
        onCapoOffsetChange={handleCapoOffsetChange}
      />
    </div>
  ) : null;

  const notationPanel = showNotation ? (
    <div className={`music-view-notation gig-mode-notation-col tune-panel-notation${!showChordsAnnotate ? ' no-inline-chords' : ''}${layout.main === 'notation' ? ' tune-slot-main' : ''}`} ref={notationColRef}>
      <div className="gig-mode-notation-paper music-notation-section">
        <div className="gig-mode-notation-render" ref={notationRef} />
      </div>
    </div>
  ) : null;

  const backgroundInfoText = currentTune && typeof currentTune.backgroundInfo === 'string'
    ? currentTune.backgroundInfo.trim()
    : '';
  const infoPanel = showInfo && currentTune && (backgroundInfoText || infoOnlyFullPage) ? (
    <div className={'tune-background-info-view gig-mode-info-panel' + (infoOnlyFullPage ? ' tune-background-info-view--full-page' : '')}>
      {infoOnlyFullPage ? (
        <div className="title music-tune-heading">
          {currentTune.name}
          {currentTune.composer ? <span className="music-tune-composer"> - {currentTune.composer}</span> : null}
        </div>
      ) : null}
      {backgroundInfoText ? (
        <MarkdownContent text={backgroundInfoText} />
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <Modal
        show={!!props.show}
        onHide={handleClose}
        fullscreen={true}
        backdrop="static"
        keyboard={false}
        enforceFocus={false}
        className={'gig-mode-modal' + (isDarkTheme ? ' gig-mode-night' : '')}
        style={{ zIndex: 1250 }}
      >
        <Modal.Header className="gig-mode-header">
          <div className="gig-mode-header-top">
            <div className="gig-mode-header-title-row">
              <Modal.Title>
                {setlistTitle ? 'Setlist ' + setlistTitle : 'Setlist'}
              </Modal.Title>
              <span className="gig-mode-progress" aria-live="polite">{progressLabel}</span>
            </div>
            <Button size="sm" variant="danger" className="gig-mode-stop-btn" onClick={handleClose}>
              {tunebook.icons.close}
              <span>Close</span>
            </Button>
          </div>
          <div className="gig-mode-toolbar">
            <div className="gig-mode-toolbar-cluster">
              {currentTune && (
                <LyricsAutoscrollModal
                  tune={currentTune}
                  tunebook={tunebook}
                  mediaController={props.mediaController}
                  mediaLinkNumber={0}
                  musicSingleSelector=".gig-mode-body"
                  barLayout="gig-inline"
                  buttonVariant="outline-secondary"
                  buttonSize="sm"
                />
              )}
              {currentTune && (
                <ViewModeSelectorModal
                  className="gig-mode-view-mode-selector"
                  viewMode={viewMode}
                  tune={currentTune}
                  tunebook={tunebook}
                  notationFitMode={notationFitMode}
                  onNotationFitModeChange={handleNotationFitModeChange}
                  onVoiceSettingsChange={function() {
                    setVoiceSettingsVersion(function(v) { return v + 1; });
                  }}
                  onChange={handleViewModeChange}
                />
              )}
              <span className="gig-mode-toolbar-label">Transpose</span>
              <ButtonGroup size="sm" className="gig-mode-transpose-group">
                <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(-1); }} aria-label="Transpose down">−</Button>
                <Button variant="outline-secondary" disabled>{tuneTranspose >= 0 ? '+' + tuneTranspose : tuneTranspose}</Button>
                <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(1); }} aria-label="Transpose up">+</Button>
              </ButtonGroup>
              {showLyricsContent && availableFlags.lyrics && !fitHeightOn ? (
                <LyricsZoomControls
                  className="gig-mode-zoom-group"
                  zoom={fontScale}
                  onChange={changeFontScale}
                />
              ) : null}
              {currentTune && hasAbcChords ? (
                <ChordPitchButton
                  chordChart={melodyChordChart}
                  structureSelector=".structure-chord-block"
                  lastNotationChordRef={lastNotationChordRef}
                  icon={tunebook.icons.blockchord}
                />
              ) : null}
              <div className="gig-mode-toolbar-right">
                {currentTune ? (
                  <StructureCapoControl
                    className="gig-mode-capo-control"
                    tune={currentTune}
                    chordGridText={melodyChordChart}
                    capoOffset={capoState.capoOffset}
                    capoEnabled={capoState.capoEnabled}
                    onToggle={capoState.toggleCapo}
                    onOffsetChange={handleCapoOffsetChange}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant={isDarkTheme ? 'primary' : 'outline-secondary'}
                  className="gig-mode-theme-btn"
                  aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
                  title={isDarkTheme ? 'Light theme' : 'Dark theme'}
                  aria-pressed={isDarkTheme}
                  onClick={handleToggleDarkTheme}
                >
                  {tunebook.icons.moon}
                </Button>
                {currentTune ? (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    className="gig-mode-open-tune-btn"
                    aria-label="Open tune"
                    title="Open tune"
                    onClick={function() {
                      if (currentTune.id) navigate('/editor/' + encodeURIComponent(currentTune.id));
                    }}
                  >
                    {tunebook.icons.pencil}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Modal.Header>
        <Modal.Body className="gig-mode-body" ref={gigBodyRef} tabIndex={-1}>
          <div className="gig-mode-body-inner">
            {edgeMessage && <div className="gig-mode-end-banner">{edgeMessage}</div>}
            {currentTune ? (
              <div className="gig-mode-content">
                <div className="gig-mode-chart">
                  <div className="gig-mode-tune-header">
                    <div className="gig-mode-tune-header-text">
                      <div className="gig-mode-tune-title-row">
                        <h2 className="gig-mode-tune-title">{currentTune.name}</h2>
                        {activeTuneNote && (
                          <span className="gig-mode-tune-inline-note">{activeTuneNote}</span>
                        )}
                        {(tuneTranspose !== 0) && (
                          <span className="gig-mode-transpose-label">
                            Transpose {tuneTranspose > 0 ? '+' : ''}{tuneTranspose}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {viewModesEmpty ? (
                  <div className="tune-view-modes-empty" role="status">
                    No view modes enabled
                  </div>
                ) : (
                  <div className={'tune-display-panels ' + layout.layoutClass + (notationFitMode === NOTATION_FIT_VERTICAL ? ' music-panels-fit-height' : '')}>
                    {notationPanel}
                    {lyricsStructurePanel || lyricsPanel}
                    {structurePanel}
                  </div>
                )}
                {infoPanel ? (
                  <>
                    <hr className="music-page-divider" />
                    {infoPanel}
                  </>
                ) : null}
              </div>
            ) : (
              <p>No tunes in this set.</p>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer className="gig-mode-footer">
          <Button variant="primary" className="gig-mode-footer-btn gig-mode-footer-btn--previous" onClick={handlePrevious}>
            {tunebook.icons.previous}
            <span>Previous</span>
          </Button>
          <Button
            variant="outline-secondary"
            className="gig-mode-footer-btn gig-mode-footer-btn--list"
            aria-label="Set list"
            title="Set list"
            onClick={function() { setShowSetList(true); }}
          >
            {tunebook.icons.menu}
            <span>List</span>
          </Button>
          <Button variant="primary" className="gig-mode-footer-btn gig-mode-footer-btn--next" onClick={handleNext}>
            <span>Next</span>
            {tunebook.icons.next}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showSetList}
        onHide={function() { setShowSetList(false); }}
        centered
        scrollable
        className={'gig-mode-setlist-modal' + (isDarkTheme ? ' gig-mode-night' : '')}
        backdropClassName="gig-mode-setlist-backdrop"
        style={{ zIndex: 1270 }}
        enforceFocus={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>{setPlaylist && setPlaylist.name ? setPlaylist.name : 'Set list'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="gig-mode-setlist-body">
          {playlistTunes.length === 0 ? (
            <p className="app-text-muted mb-0">No songs in this set.</p>
          ) : (
            <ol className="gig-mode-setlist">
              {playlistTunes.map(function(tune, index) {
                const isCurrent = index === currentIndex;
                return (
                  <li key={(tune && tune.id) || index} className={isCurrent ? 'gig-mode-setlist-item--current' : ''}>
                    <button
                      type="button"
                      className="gig-mode-setlist-link"
                      onClick={function() {
                        goToIndex(index);
                        setShowSetList(false);
                      }}
                    >
                      {tune && tune.name ? tune.name : 'Untitled'}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
