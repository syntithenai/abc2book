import { useEffect, useMemo, useRef } from 'react'
import abcjs from 'abcjs'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import LyricsDisplayLines from '../LyricsDisplayLines'
import useAbcjsParser from '../useAbcjsParser'
import { normalizeViewMode, showsMusicNotation, viewModeToDisplayFlags } from '../viewModeUtils'
import { getLyricLinesForDisplay } from '../wLinesUtils'
import { hasLyricEmbeddedChords, formatChordChartForDisplay } from '../chordSheetUtils'
import { buildAbcWithNoteSpacing } from '../noteSpacingUtils'
import { effectiveNotationLineCount } from '../notationFitSettings'
import {
  findStaffWidthForVerticalFit,
  fitSingleViewVertical,
  measureSingleViewPaper,
  readNotationSvgDims,
} from '../gigNotationFit'

const PRACTICE_FIT_HEIGHT_MIN_LINES = 4
const PRACTICE_FIT_HEIGHT_MAX_LINES = 6

function stripPracticeNotationHeaders(abcText) {
  if (!abcText) return ''
  let seenComposer = false
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim()
    if (trimmed.startsWith('B:')) return false
    if (trimmed.startsWith('T:')) return false
    if (trimmed.startsWith('N: AKA:')) return false
    if (trimmed.startsWith('% abcbook-tags')) return false
    if (/^C:/i.test(trimmed)) {
      if (seenComposer) return false
      seenComposer = true
      return true
    }
    return true
  }).join('\n')
}

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

  const viewMode = normalizeViewMode(props.viewMode || 'music')
  const flags = viewModeToDisplayFlags(viewMode)
  const isMusicView = viewMode === 'music'
  const isMusicAndLyricsView = !!flags.lyrics && flags.notation !== 'off'
  // musicAndLyrics has structure:true for other UI — do not treat it as chord-block.
  const isChordBlockView = flags.notation === 'off' || viewMode === 'chordsBlock'
  const showNotation = showsMusicNotation(viewMode)

  const notationLineCount = useMemo(function() {
    if (!tune || !showNotation) return 0
    return effectiveNotationLineCount(tune)
  }, [tune, showNotation])

  const fitHeight = showNotation
    && notationLineCount >= PRACTICE_FIT_HEIGHT_MIN_LINES
    && notationLineCount <= PRACTICE_FIT_HEIGHT_MAX_LINES
  const needsNotationScroll = showNotation && notationLineCount > PRACTICE_FIT_HEIGHT_MAX_LINES

  useEffect(function() {
    if (!showNotation) {
      clearNotationEl(notationRef.current)
      return
    }
    if (!tune || !notationRef.current) return
    clearNotationEl(notationRef.current)
    const displayAbc = buildAbcWithNoteSpacing(tune, tunebook.abcTools, { includeLyrics: isMusicAndLyricsView })
    const staffAbc = stripPracticeNotationHeaders(displayAbc)
    const initialStaffWidth = props.staffWidth || 700
    try {
      function renderAtWidth(staffWidth) {
        abcjs.renderAbc(notationRef.current, staffAbc, {
          responsive: 'resize',
          staffwidth: staffWidth,
        })
        const svg = notationRef.current && notationRef.current.querySelector('svg')
        if (!svg) return null
        const dims = readNotationSvgDims(svg)
        if (!dims || !(dims.width > 0) || !(dims.height > 0)) return null
        return { svg: svg, dims: dims }
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
      } else {
        renderAtWidth(initialStaffWidth)
      }
    } catch (e) {
      console.log('practice tune render', e)
    }
  }, [tune, tunebook, showNotation, isMusicAndLyricsView, props.staffWidth, fitHeight, notationLineCount])

  const plainLyricLines = useMemo(function() {
    if (!tune) return []
    return getLyricLinesForDisplay(tune)
  }, [tune])

  useEffect(function() {
    if (typeof props.onLayoutNeeds !== 'function') return
    props.onLayoutNeeds({
      fitHeight: fitHeight,
      needsNotationScroll: needsNotationScroll,
      notationLineCount: notationLineCount,
      hasLyrics: plainLyricLines.length > 0,
      lyricLineCount: plainLyricLines.length,
    })
  }, [fitHeight, needsNotationScroll, notationLineCount, plainLyricLines.length, props.onLayoutNeeds])

  const isLyricChordSheet = useMemo(function() {
    return hasLyricEmbeddedChords(plainLyricLines)
  }, [plainLyricLines])
  const chords = useMemo(function() {
    if (!tune) return ''
    const firstVoice = tune.voices && Object.keys(tune.voices).length > 0
      ? Object.values(tune.voices)[0]
      : { notes: [] }
    const chordTranspose = Number(tune.transpose) || 0
    const noteLines = firstVoice && Array.isArray(firstVoice.notes) ? firstVoice.notes : []
    if (noteLines.length === 0) return ''
    try {
      return formatChordChartForDisplay(abcjsParser.renderChords(
        tunebook.abcTools.emptyABC(tune.name || 'Tune') + noteLines.join('\n'),
        false,
        chordTranspose,
        tune.key,
        tune.noteLength,
        tune.meter
      ))
    } catch (e) {
      console.log('practice chord chart render', e)
      return ''
    }
  }, [tune, tunebook, abcjsParser])

  if (!tune) return null

  const lyricsViewProps = {
    tune: tune,
    tunebook: tunebook,
    suppressLeadingTitle: true,
  }

  const fullLyricsPanel = plainLyricLines.length > 0 ? (
    isLyricChordSheet
      ? <TimedLyricsChordsView {...lyricsViewProps} />
      : <LyricsDisplayLines className="practice-tune-lyrics" lines={plainLyricLines} />
  ) : null

  const paperClass = 'practice-tune-paper'
    + (fitHeight ? ' practice-tune-paper--fit-height' : '')
    + (needsNotationScroll ? ' practice-tune-paper--scroll' : '')

  if (isChordBlockView) {
    return (
      <div className="practice-tune-display practice-tune-chords" ref={paperRef}>
        {(isLyricChordSheet || plainLyricLines.length > 0) && (
          <div className="practice-tune-lyrics-panel">
            {isLyricChordSheet
              ? <TimedLyricsChordsView {...lyricsViewProps} />
              : fullLyricsPanel}
          </div>
        )}
        {chords.trim().length > 0 && (
          <pre className="practice-tune-chord-chart">{chords}</pre>
        )}
      </div>
    )
  }

  if (isMusicAndLyricsView && plainLyricLines.length > 0) {
    return (
      <div className={'practice-tune-display practice-tune-music-lyrics ' + paperClass} ref={paperRef}>
        <div className="practice-tune-split">
          <div className="practice-tune-notation" ref={notationRef} />
          <div className="practice-tune-lyrics-panel">{fullLyricsPanel}</div>
        </div>
      </div>
    )
  }

  if (isMusicView || showNotation) {
    return (
      <div className={'practice-tune-display practice-tune-music ' + paperClass} ref={paperRef}>
        <div className="practice-tune-notation" ref={notationRef} />
      </div>
    )
  }

  return (
    <div className="practice-tune-display" ref={paperRef}>
      {fullLyricsPanel}
    </div>
  )
}
