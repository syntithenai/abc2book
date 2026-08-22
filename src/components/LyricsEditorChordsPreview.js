import React, { useEffect, useMemo, useState } from 'react'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import StructureChordBlock from './StructureChordBlock'
import useAbcjsParser from '../useAbcjsParser'
import { chordNoteLinesFromTune } from '../chordBlockMerge'
import {
  chartBlockHasChords,
  hasLyricEmbeddedChords,
  linesHaveChordProInlineChords,
} from '../chordSheetUtils'
import { printChordTransposeForTune } from '../capoViewUtils'

const PREVIEW_DEBOUNCE_MS = 300

function LyricsEditorChordsPreviewInner(props) {
  const tune = props.tune
  const lyricsText = props.lyricsText
  const tunebook = props.tunebook
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })

  const previewTune = tune
    ? Object.assign({}, tune, {
      words: String(lyricsText == null ? '' : lyricsText).split('\n'),
    })
    : null
  const previewTranspose = props.transposePreview
    ? printChordTransposeForTune(previewTune)
    : 0
  // Prefer a stable notes fingerprint from props so in-place voice mutations
  // (same tune object reference) still refresh the chart.
  const melodyNoteLines = useMemo(function() {
    return chordNoteLinesFromTune(tune)
  }, [tune, props.voicesFingerprint])

  let chordChart = ''
  if (previewTune) {
    try {
      const melodyAbc = tunebook && tunebook.abcTools
        ? tunebook.abcTools.emptyABC(previewTune.name) + melodyNoteLines.join('\n')
        : ''
      chordChart = melodyAbc
        ? abcjsParser.renderChords(
          melodyAbc,
          false,
          previewTranspose,
          previewTune.key,
          previewTune.noteLength,
          previewTune.meter
        )
        : ''
    } catch (e) {
      chordChart = ''
    }
  }

  if (!previewTune) return null

  const hasNotationChords = chartBlockHasChords(chordChart)
  const lyricLines = previewTune.words || []
  const hasLyricChords = linesHaveChordProInlineChords(lyricLines)
    || hasLyricEmbeddedChords(lyricLines)
  const hasLyricText = lyricLines.some(function(line) {
    return String(line || '').trim().length > 0
  })
  // Live preview is useful for plain lyrics and ChordPro even when ABC has no
  // quoted chords. Structure blocks still need a notation chord chart.
  if (!hasNotationChords && !hasLyricChords && !hasLyricText) return null

  return (
    <>
      <aside
        className="abc-editor-lyrics-split-preview"
        data-testid="lyrics-chords-preview"
        aria-label="Lyrics preview with chords"
      >
        <div className="abc-editor-lyrics-chords-preview">
          <TimedLyricsChordsView
            tune={previewTune}
            tunebook={tunebook}
            chordTranspose={previewTranspose}
            suppressLeadingTitle={true}
            keepBeatMarkers={true}
            compact={true}
            allowNotationMerge={true}
          />
        </div>
      </aside>
      {hasNotationChords ? (
        <aside
          className="abc-editor-lyrics-split-structure"
          data-testid="lyrics-structure-chords"
          aria-label="Structured chords"
        >
          <StructureChordBlock
            chords={chordChart}
            tune={previewTune}
            melodyNoteLines={melodyNoteLines}
            chordTranspose={previewTranspose}
          />
        </aside>
      ) : null}
    </>
  )
}

/**
 * Live lyrics+chords preview plus structured chord blocks for the lyrics editor.
 * Debounces lyric text so typing in the editor does not rebuild the preview
 * on every keystroke.
 */
export default function LyricsEditorChordsPreview(props) {
  const lyricsText = props.lyricsText
  const [debouncedLyrics, setDebouncedLyrics] = useState(lyricsText)

  useEffect(function() {
    if (debouncedLyrics === lyricsText) return undefined
    const timer = setTimeout(function() {
      setDebouncedLyrics(lyricsText)
    }, PREVIEW_DEBOUNCE_MS)
    return function() { clearTimeout(timer) }
  }, [lyricsText, debouncedLyrics])

  const voicesFingerprint = chordNoteLinesFromTune(props.tune).join('\n')

  return (
    <LyricsEditorChordsPreviewInner
      tune={props.tune}
      tunebook={props.tunebook}
      lyricsText={debouncedLyrics}
      transposePreview={!!props.transposePreview}
      voicesFingerprint={voicesFingerprint}
    />
  )
}
