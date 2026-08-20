import { useEffect, useMemo, useRef, useState } from 'react'
import abcjs from 'abcjs'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import LyricsStructureSyncPanel from './LyricsStructureSyncPanel'
import StructureChordBlock from './StructureChordBlock'
import MarkdownContent from './MarkdownContent'
import useAbcjsParser from '../useAbcjsParser'
import {
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
  getAvailableDisplayFlags,
} from '../viewModeUtils'
import { resolveTuneDisplayLayout, isViewModesEmpty, isStructureOnlyLayout } from '../tuneDisplayLayout'
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay'
import { getLyricLinesForDisplay } from '../wLinesUtils'
import { buildAbcWithNoteSpacing } from '../noteSpacingUtils'
import { prepareGigStaffDisplayAbc } from '../notation/notationDisplayAbc'
import { effectiveNotationLineCount } from '../notationFitSettings'
import { filterTuneVoices } from '../abcVoiceFilter'
import { getTuneVoiceKeys, getVisibleVoiceKeys } from '../abcVoiceViewSettings'
import {
  applyCompactScreenNotationMeta,
  findStaffWidthForVerticalFit,
  fitSingleViewVertical,
  measureSingleViewPaper,
  readNotationSvgDims,
  buildGigNotationRenderOptions,
} from '../gigNotationFit'
import { useCapoViewState } from '../useCapoViewState'
import { chordTransposeWithCapo } from '../capoViewUtils'
import useNotationPlaybackCursor from '../useNotationPlaybackCursor'

const PRACTICE_FIT_HEIGHT_MIN_LINES = 4
const PRACTICE_FIT_HEIGHT_MAX_LINES = 6

function clearNotationEl(el) {
  if (!el) return
  el.innerHTML = ''
  el.style.height = ''
  el.style.maxHeight = ''
  el.style.overflowX = ''
  el.style.overflowY = ''
  el.classList.remove(
    'gig-mode-notation-render--fit-vertical',
    'gig-mode-notation-render--fit-horizontal',
    'gig-mode-notation-render--fit-width',
    'gig-mode-notation-render--scroll-y',
    'gig-mode-notation-render--wide'
  )
}

export default function PracticeTuneDisplay(props) {
  const tune = props.tune
  const tunebook = props.tunebook
  const notationRef = useRef(null)
  const paperRef = useRef(null)
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const voiceSettingsVersion = props.voiceSettingsVersion || 0
  const [cursorVisualObj, setCursorVisualObj] = useState(null)

  const viewMode = props.viewMode || 'music'
  const capoState = useCapoViewState(tune && tune.id, tune && tune.capo)
  const tuneTranspose = tune ? (Number(tune.transpose) || 0) : 0
  const chordTranspose = chordTransposeWithCapo(tuneTranspose, capoState.capoOffset, capoState.capoEnabled)
  const notationVisualTranspose = chordTranspose

  function handleCapoOffsetChange(offset) {
    capoState.applyCapoOffset(offset)
    if (tune && tunebook) {
      tunebook.saveTune(Object.assign({}, tune, { capo: offset }))
    }
  }

  const hasNotes = !!(tune && tunebook && tunebook.hasNotes && tunebook.hasNotes(tune))
  const hasChords = !!tune && tuneHasExplicitChords(tune, tunebook, abcjsParser)
  const displayFlags = useMemo(function() {
    if (!tune) return viewModeToDisplayFlags(viewMode)
    return resolveDisplayFlagsForTune(
      viewModeToDisplayFlags(viewMode),
      tune,
      tunebook,
      { hasChords: hasChords }
    )
  }, [viewMode, tune, tunebook, hasChords])
  const availableFlags = useMemo(function() {
    if (!tune) {
      return { notation: true, lyrics: true, structure: true, chords: true, info: true }
    }
    return getAvailableDisplayFlags(tune, tunebook, {
      hasChords: hasChords,
      hasInfo: !!(tune.backgroundInfo && String(tune.backgroundInfo).trim()),
    })
  }, [tune, tunebook, hasChords])
  const layout = useMemo(function() {
    return resolveTuneDisplayLayout(displayFlags)
  }, [displayFlags])

  const showLyrics = !!displayFlags.lyrics
  const showStructure = !!displayFlags.structure && hasChords
  const showChordsAnnotate = !!displayFlags.chords
  const showInfo = !!displayFlags.info
  const showNotation = displayFlags.notation !== 'off' && hasNotes
  const hideChordsInText = !showChordsAnnotate
  const syncLyricsStructure = !!layout.syncLyricsStructure
  const structureOnlyView = showStructure && !syncLyricsStructure && isStructureOnlyLayout(displayFlags)
  const structureFitHeight = showStructure && !syncLyricsStructure
  const structureFitHeightGrow = structureOnlyView
  const infoOnlyFullPage = showInfo && !showNotation && !showLyrics && !showStructure

  const visibleVoiceKeys = useMemo(function() {
    if (!tune) return []
    return getVisibleVoiceKeys(tune.id, getTuneVoiceKeys(tune))
  }, [tune, voiceSettingsVersion])

  const notationLineCount = useMemo(function() {
    if (!tune || !showNotation) return 0
    return effectiveNotationLineCount(tune)
  }, [tune, showNotation])

  const fitHeight = showNotation
    && notationLineCount >= PRACTICE_FIT_HEIGHT_MIN_LINES
    && notationLineCount <= PRACTICE_FIT_HEIGHT_MAX_LINES
  const needsNotationScroll = showNotation && notationLineCount > PRACTICE_FIT_HEIGHT_MAX_LINES

  const staffAbc = useMemo(function() {
    if (!showNotation || !tune || !tunebook) return ''
    const notationTune = filterTuneVoices(tune, visibleVoiceKeys)
    const displayAbc = buildAbcWithNoteSpacing(notationTune, tunebook.abcTools, { includeLyrics: false })
    return prepareGigStaffDisplayAbc(displayAbc, tunebook, showChordsAnnotate)
  }, [
    showNotation,
    tune,
    tunebook,
    showChordsAnnotate,
    visibleVoiceKeys,
  ])

  useNotationPlaybackCursor({
    enabled: showNotation && !!props.mediaController,
    containerRef: notationRef,
    visualObj: cursorVisualObj,
    mediaController: props.mediaController,
    displayTuneId: tune && tune.id,
    tempoFactor: props.mediaController && props.mediaController.playbackSpeed,
  })

  useEffect(function() {
    if (!showNotation) {
      clearNotationEl(notationRef.current)
      setCursorVisualObj(null)
      return
    }
    if (!tune || !notationRef.current || !staffAbc) return
    clearNotationEl(notationRef.current)
    const initialStaffWidth = props.staffWidth || 700
    try {
      function renderAtWidth(staffWidth) {
        const rendered = abcjs.renderAbc(notationRef.current, staffAbc, Object.assign({
          responsive: 'resize',
          staffwidth: staffWidth,
        }, buildGigNotationRenderOptions(notationVisualTranspose), {
          afterParsing: applyCompactScreenNotationMeta,
        }))
        const svg = notationRef.current && notationRef.current.querySelector('svg')
        if (!svg) return null
        const dims = readNotationSvgDims(svg)
        if (!dims || !(dims.width > 0) || !(dims.height > 0)) return null
        return {
          svg: svg,
          dims: dims,
          visual: rendered && rendered.length > 0 ? rendered[0] : null,
        }
      }

      if (fitHeight) {
        const paper = measureSingleViewPaper(notationRef.current)
        const staffFit = findStaffWidthForVerticalFit(function(staffWidth) {
          return renderAtWidth(staffWidth)
        }, paper.availW || initialStaffWidth, paper.availH || 400, initialStaffWidth)
        const width = staffFit && staffFit.staffWidth
          ? Math.min(paper.availW || initialStaffWidth, staffFit.staffWidth)
          : initialStaffWidth
        const rendered = renderAtWidth(width)
        if (rendered && rendered.svg) {
          fitSingleViewVertical(rendered.svg, notationRef.current)
        }
        setCursorVisualObj(rendered && rendered.visual ? rendered.visual : null)
      } else {
        const rendered = renderAtWidth(initialStaffWidth)
        setCursorVisualObj(rendered && rendered.visual ? rendered.visual : null)
      }
    } catch (e) {
      console.log('practice tune render', e)
      setCursorVisualObj(null)
    }
  }, [
    staffAbc,
    props.staffWidth,
    fitHeight,
    notationLineCount,
    notationVisualTranspose,
  ])

  useEffect(function() {
    if (typeof props.onLayoutNeeds !== 'function') return
    const lyricLineCount = tune ? getLyricLinesForDisplay(tune).length : 0
    props.onLayoutNeeds({
      fitHeight: fitHeight,
      needsNotationScroll: needsNotationScroll,
      notationLineCount: notationLineCount,
      hasLyrics: lyricLineCount > 0,
      lyricLineCount: lyricLineCount,
    })
  }, [fitHeight, needsNotationScroll, notationLineCount, tune, props.onLayoutNeeds])

  const structureMelodyNoteLines = useMemo(function() {
    if (!tune || !tune.voices || Object.keys(tune.voices).length === 0) return []
    const firstVoice = Object.values(tune.voices)[0]
    return firstVoice && Array.isArray(firstVoice.notes) ? firstVoice.notes : []
  }, [tune])

  const structureChordChart = useMemo(function() {
    if (!tune || !showStructure || !tunebook) return ''
    try {
      return abcjsParser.renderChords(
        tunebook.abcTools.emptyABC(tune.name || 'Tune') + structureMelodyNoteLines.join('\n'),
        false,
        chordTranspose,
        tune.key,
        tune.noteLength,
        tune.meter
      ) || ''
    } catch (e) {
      return ''
    }
  }, [tune, tunebook, abcjsParser, showStructure, chordTranspose, structureMelodyNoteLines])

  if (!tune) return null

  const backgroundInfoText = typeof tune.backgroundInfo === 'string'
    ? tune.backgroundInfo.trim()
    : ''

  const paperClass = 'practice-tune-paper'
    + (fitHeight ? ' practice-tune-paper--fit-height' : '')
    + (needsNotationScroll ? ' practice-tune-paper--scroll' : '')

  const lyricsStructurePanel = syncLyricsStructure ? (
    <div className="tune-panel-lyrics-structure-sync tune-panel-lyrics tune-slot-main">
      <LyricsStructureSyncPanel
        tune={tune}
        tunebook={tunebook}
        chordTranspose={chordTranspose}
        hideChords={hideChordsInText}
        chords={structureChordChart}
        melodyNoteLines={structureMelodyNoteLines}
        showCapoControl={showStructure}
        capoOffset={capoState.capoOffset}
        capoEnabled={capoState.capoEnabled}
        onCapoToggle={capoState.toggleCapo}
        onCapoOffsetChange={handleCapoOffsetChange}
      />
    </div>
  ) : null

  const lyricsPanel = showLyrics && !syncLyricsStructure ? (
    <div className={'tune-panel-lyrics' + (layout.main === 'lyrics' ? ' tune-slot-main' : '') + (layout.side === 'lyrics' ? ' tune-slot-side' : '') + (layout.below === 'lyrics' ? ' tune-slot-below' : '')}>
      <TimedLyricsChordsView
        tune={tune}
        tunebook={tunebook}
        chordTranspose={chordTranspose}
        hideChords={hideChordsInText}
        suppressLeadingTitle={true}
      />
    </div>
  ) : null

  const structurePanel = showStructure && !syncLyricsStructure ? (
    <div className={'tune-panel-structure' + (layout.main === 'structure' ? ' tune-slot-main' : '') + (layout.side === 'structure' ? ' tune-slot-side' : '')}>
      <StructureChordBlock
        chords={structureChordChart}
        tune={tune}
        melodyNoteLines={structureMelodyNoteLines}
        chordTranspose={chordTranspose}
        fitHeight={structureFitHeight}
        fitHeightGrow={structureFitHeightGrow}
        showCapoControl={true}
        capoOffset={capoState.capoOffset}
        capoEnabled={capoState.capoEnabled}
        onCapoToggle={capoState.toggleCapo}
        onCapoOffsetChange={handleCapoOffsetChange}
      />
    </div>
  ) : null

  const notationPanel = showNotation ? (
    <div className={'practice-tune-notation tune-panel-notation' + (layout.main === 'notation' ? ' tune-slot-main' : '') + (!showChordsAnnotate ? ' no-inline-chords' : '')}>
      <div className="practice-tune-notation-inner" ref={notationRef} />
    </div>
  ) : null

  const infoPanel = showInfo && (backgroundInfoText || infoOnlyFullPage) ? (
    <div className={'tune-background-info-view' + (infoOnlyFullPage ? ' tune-background-info-view--full-page' : '')}>
      {infoOnlyFullPage ? (
        <div className="title music-tune-heading">
          {tune.name}
          {tune.composer ? <span className="music-tune-composer"> - {tune.composer}</span> : null}
        </div>
      ) : null}
      {backgroundInfoText ? <MarkdownContent text={backgroundInfoText} /> : null}
    </div>
  ) : null

  if (isViewModesEmpty(displayFlags, availableFlags)) {
    return (
      <div className="practice-tune-display practice-tune-empty" ref={paperRef}>
        <div className="tune-view-modes-empty" role="status">
          <div className="tune-view-modes-empty-title">Nothing to display</div>
          <div className="tune-view-modes-empty-hint">Turn on notation, lyrics, structure, or info.</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={'practice-tune-display tune-display-panels ' + layout.layoutClass + ' ' + paperClass}
      ref={paperRef}
    >
      {infoPanel}
      {lyricsStructurePanel}
      {notationPanel}
      {lyricsPanel}
      {structurePanel}
    </div>
  )
}
