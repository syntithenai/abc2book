import { useEffect, useMemo, useRef } from 'react'
import abcjs from 'abcjs'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import LyricsDisplayLines from '../LyricsDisplayLines'
import useAbcjsParser from '../useAbcjsParser'
import { normalizeViewMode, showsMusicNotation } from '../viewModeUtils'
import { getLyricLinesForDisplay } from '../wLinesUtils'
import { hasChordLines, formatChordChartForDisplay } from '../chordSheetUtils'
import { buildAbcWithNoteSpacing } from '../noteSpacingUtils'

function stripPracticeNotationHeaders(abcText) {
  if (!abcText) return ''
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim()
    if (trimmed.startsWith('B:')) return false
    if (trimmed.startsWith('T:')) return false
    if (trimmed.startsWith('N: AKA:')) return false
    if (trimmed.startsWith('% abcbook-tags')) return false
    return true
  }).join('\n')
}

export default function PracticeTuneDisplay(props) {
  const tune = props.tune
  const tunebook = props.tunebook
  const notationRef = useRef(null)
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })

  const viewMode = normalizeViewMode(props.viewMode || 'music')
  const isMusicView = viewMode === 'music'
  const isMusicAndLyricsView = viewMode === 'musicAndLyrics'
  const isChordBlockView = viewMode === 'chordsBlock'
  const showNotation = showsMusicNotation(viewMode)

  useEffect(function() {
    if (!tune || !notationRef.current || !showNotation) return
    const displayAbc = buildAbcWithNoteSpacing(tune, tunebook.abcTools, { includeLyrics: isMusicAndLyricsView })
    const staffAbc = stripPracticeNotationHeaders(displayAbc)
    try {
      abcjs.renderAbc(notationRef.current, staffAbc, {
        responsive: 'resize',
        staffwidth: props.staffWidth || 700,
      })
    } catch (e) {
      console.log('practice tune render', e)
    }
  }, [tune, tunebook, showNotation, isMusicAndLyricsView, props.staffWidth])

  const plainLyricLines = useMemo(function() {
    if (!tune) return []
    return getLyricLinesForDisplay(tune)
  }, [tune])
  const isLyricChordSheet = useMemo(function() {
    return hasChordLines(plainLyricLines)
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

  if (isChordBlockView) {
    return (
      <div className="practice-tune-display practice-tune-chords">
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
      <div className="practice-tune-display practice-tune-music-lyrics">
        <div className="practice-tune-split">
          <div className="practice-tune-notation" ref={notationRef} />
          <div className="practice-tune-lyrics-panel">{fullLyricsPanel}</div>
        </div>
      </div>
    )
  }

  if (isMusicView || showNotation) {
    return (
      <div className="practice-tune-display practice-tune-music">
        <div className="practice-tune-notation" ref={notationRef} />
      </div>
    )
  }

  return (
    <div className="practice-tune-display">
      {fullLyricsPanel}
    </div>
  )
}
