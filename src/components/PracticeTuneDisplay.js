import { useEffect, useRef } from 'react'
import abcjs from 'abcjs'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import useAbcjsParser from '../useAbcjsParser'
import { normalizeViewMode, showsMusicNotation } from '../viewModeUtils'
import { getLyricLinesForDisplay } from '../wLinesUtils'
import { hasChordLines, formatChordChartForDisplay } from '../chordSheetUtils'
import { buildAbcWithNoteSpacing } from '../noteSpacingUtils'

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
    const staffAbc = displayAbc.split('\n').filter(function(line) {
      return !line.startsWith('B:')
    }).join('\n')
    try {
      abcjs.renderAbc(notationRef.current, staffAbc, {
        responsive: 'resize',
        staffwidth: props.staffWidth || 700,
      })
    } catch (e) {
      console.log('practice tune render', e)
    }
  }, [tune, tunebook, showNotation, isMusicAndLyricsView, props.staffWidth])

  if (!tune) return null

  const plainLyricLines = getLyricLinesForDisplay(tune)
  const isLyricChordSheet = hasChordLines(plainLyricLines)
  const firstVoice = tune.voices && Object.keys(tune.voices).length > 0
    ? Object.values(tune.voices)[0]
    : { notes: [] }
  const chordTranspose = Number(tune.transpose) || 0
  const noteLines = firstVoice && Array.isArray(firstVoice.notes) ? firstVoice.notes : []
  let chords = ''
  if (noteLines.length > 0) {
    try {
      chords = formatChordChartForDisplay(abcjsParser.renderChords(
        tunebook.abcTools.emptyABC(tune.name || 'Tune') + noteLines.join('\n'),
        false,
        chordTranspose,
        tune.key,
        tune.noteLength,
        tune.meter
      ))
    } catch (e) {
      console.log('practice chord chart render', e)
    }
  }

  const fullLyricsPanel = plainLyricLines.length > 0 ? (
    isLyricChordSheet
      ? <TimedLyricsChordsView tune={tune} tunebook={tunebook} />
      : <div className="practice-tune-lyrics">
        {plainLyricLines.map(function(line, index) {
          if (!line || String(line).trim().length === 0) {
            return <div key={index} className="lyrics-line-spacer" style={{ height: '0.6em' }} />
          }
          return <div key={index} className="lyrics-line" style={{ marginBottom: '0.35em' }}>{line}</div>
        })}
      </div>
  ) : null

  if (isChordBlockView) {
    return (
      <div className="practice-tune-display practice-tune-chords">
        <div className="practice-tune-title">{tune.name}</div>
        {(isLyricChordSheet || plainLyricLines.length > 0) && (
          <div className="practice-tune-lyrics-panel">
            {isLyricChordSheet
              ? <TimedLyricsChordsView tune={tune} tunebook={tunebook} />
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
        <div className="practice-tune-title">{tune.name}</div>
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
        <div className="practice-tune-title">{tune.name}</div>
        <div className="practice-tune-notation" ref={notationRef} />
      </div>
    )
  }

  return (
    <div className="practice-tune-display">
      <div className="practice-tune-title">{tune.name}</div>
      {fullLyricsPanel}
    </div>
  )
}
