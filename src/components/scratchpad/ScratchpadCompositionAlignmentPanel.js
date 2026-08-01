import { useMemo } from 'react'
import { Form } from 'react-bootstrap'
import { NotationPreview, buildAbcFromTune } from '../SuggestionPreviewDialog'
import { lyricAssignmentsForMelody } from '../../lyricBarAlignmentUtils'
import { getScratchpadItem } from '../../scratchpadStore'
import {
  extractLyricsChunkLines,
  buildCompositionPairings,
  buildAbcForNotationChunk,
} from '../../scratchpadCompositionAssembly'
import { resolvePrimaryVoiceKey } from '../../abcVoiceUtils'

function sortChunks(chunks) {
  return (Array.isArray(chunks) ? chunks.slice() : []).sort(function(a, b) {
    return (Number(a && a.order) || 0) - (Number(b && b.order) || 0)
  })
}

function pairingLyricsText(chunk) {
  if (!chunk) return ''
  const sourceItem = getScratchpadItem(chunk.sourceItemId)
  const lines = extractLyricsChunkLines(sourceItem, chunk)
  return lines.join('\n')
}

function pairingLabel(pair, index) {
  const lyricsLabel = pair.lyricsChunk ? pair.lyricsChunk.label : '—'
  const notationLabel = pair.notationChunk ? pair.notationChunk.label : 'none'
  return String(index + 1) + '. ' + lyricsLabel + ' → ' + notationLabel
}

export default function ScratchpadCompositionAlignmentPanel(props) {
  const composition = props.composition || {}
  const tune = composition.tuneSnapshot
  const notationChunks = sortChunks(composition.notationChunks || []).filter(function(chunk) {
    return chunk && chunk.enabled !== false
  })

  const pairings = useMemo(function() {
    return buildCompositionPairings(composition)
  }, [composition])

  const barAssignments = useMemo(function() {
    if (!tune || !tune.voices) return []
    const voiceKey = resolvePrimaryVoiceKey(tune.voices)
    const noteLines = tune.voices[voiceKey] && tune.voices[voiceKey].notes || []
    const lyricLines = Array.isArray(tune.words) ? tune.words : []
    try {
      return lyricAssignmentsForMelody(noteLines, lyricLines)
    } catch (e) {
      return []
    }
  }, [tune])

  const previewAbc = useMemo(function() {
    return buildAbcFromTune(tune)
  }, [tune])

  return (
    <div className="scratchpad-composition-alignment">
      <h6 className="scratchpad-composition-alignment-title">Alignment</h6>
      <p className="scratchpad-composition-alignment-help text-muted small">
        Lyrics and notation pair by <strong>order</strong> (1st with 1st, 2nd with 2nd).
        Reorder chunks in the sidebar to change the default pairing, or pick a notation chunk for each row below.
      </p>
      <div className="scratchpad-composition-pairings">
        {pairings.map(function(pair, index) {
          const lyricsText = pairingLyricsText(pair.lyricsChunk)
          const notationChunk = pair.notationChunk
          const notationAbc = notationChunk ? buildAbcForNotationChunk(notationChunk) : ''
          const selectedNotationId = notationChunk ? notationChunk.id : ''
          return (
            <div key={'pair-' + index} className="scratchpad-composition-pairing-row scratchpad-composition-pairing-row--split">
              <div className="scratchpad-composition-pairing-label">{pairingLabel(pair, index)}</div>
              <div className="scratchpad-composition-pairing-columns">
                <div className="scratchpad-composition-pairing-col scratchpad-composition-pairing-lyrics">
                  <div className="scratchpad-composition-pairing-col-title">Lyrics</div>
                  {pair.lyricsChunk ? (
                    <Form.Control
                      as="textarea"
                      rows={4}
                      className="scratchpad-composition-pairing-textarea"
                      value={lyricsText}
                      readOnly={!props.onLyricsChange}
                      onChange={function(e) {
                        if (props.onLyricsChange && pair.lyricsChunk) {
                          props.onLyricsChange(pair.lyricsChunk.id, e.target.value)
                        }
                      }}
                    />
                  ) : (
                    <div className="text-muted small">No lyrics chunk</div>
                  )}
                </div>
                <div className="scratchpad-composition-pairing-col scratchpad-composition-pairing-notation">
                  <div className="scratchpad-composition-pairing-col-title">Notation</div>
                  {pair.lyricsChunk ? (
                    <Form.Select
                      size="sm"
                      className="scratchpad-composition-pairing-select mb-2"
                      value={selectedNotationId}
                      onChange={function(e) {
                        if (props.onPairingChange) {
                          props.onPairingChange(pair.lyricsChunk.id, e.target.value || null)
                        }
                      }}
                    >
                      <option value="">None (unpaired)</option>
                      {notationChunks.map(function(chunk) {
                        return (
                          <option key={chunk.id} value={chunk.id}>
                            {chunk.label}{chunk.chordMode ? ' (' + chunk.chordMode + ')' : ''}
                          </option>
                        )
                      })}
                    </Form.Select>
                  ) : null}
                  {notationAbc ? (
                    <div className="scratchpad-composition-pairing-preview">
                      <NotationPreview
                        abc={notationAbc}
                        fitWidth={true}
                        wrapToWidth={true}
                        maxHeight="180px"
                        className="scratchpad-composition-chunk-preview"
                      />
                    </div>
                  ) : notationChunk && notationChunk.sourceKind === 'chord-sheet' && notationChunk.sourceText ? (
                    <pre className="scratchpad-composition-chord-fallback small">{notationChunk.sourceText}</pre>
                  ) : notationChunk ? (
                    <div className="text-muted small">No notation preview</div>
                  ) : (
                    <div className="text-muted small">—</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {barAssignments.length ? (
        <div className="scratchpad-composition-bar-assignments mt-3">
          <h6 className="small text-muted">Bar assignments (assembled tune)</h6>
          <ul className="scratchpad-composition-bar-list">
            {barAssignments.map(function(assignment, index) {
              return (
                <li key={'bar-' + index}>
                  bars {assignment.startBar}–{assignment.endBar}: {assignment.text}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {previewAbc ? (
        <div className="scratchpad-composition-preview mt-3">
          <h6 className="small text-muted">Full composition preview</h6>
          <NotationPreview abc={previewAbc} fitWidth={true} wrapToWidth={true} />
        </div>
      ) : null}
    </div>
  )
}
