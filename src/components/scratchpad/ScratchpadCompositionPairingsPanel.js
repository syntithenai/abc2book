import { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import { NotationPreview } from '../SuggestionPreviewDialog'
import { getScratchpadItem } from '../../scratchpadStore'
import {
  extractLyricsChunkLines,
  buildCompositionPairingRows,
  buildAbcForNotationChunk,
} from '../../scratchpadCompositionAssembly'
import {
  sourceItemIdForCompositionChunk,
  previewSnippet,
} from '../../scratchpadCompositionUiUtils'

function sourceItemTitle(chunk) {
  if (!chunk || !chunk.sourceItemId) return ''
  const source = getScratchpadItem(chunk.sourceItemId)
  return source ? source.title : ''
}

function pairingLyricsText(chunk) {
  if (!chunk) return ''
  const sourceItem = getScratchpadItem(chunk.sourceItemId)
  const lines = extractLyricsChunkLines(sourceItem, chunk)
  return lines.join('\n')
}

function IconButton(props) {
  const icons = props.icons || {}
  return (
    <Button
      size="sm"
      variant="outline-secondary"
      className="scratchpad-composition-icon-btn"
      title={props.title}
      disabled={!props.onClick}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

function PairingSide(props) {
  const icons = props.icons || {}
  const chunk = props.chunk
  const isLyrics = props.side === 'lyrics'
  const label = isLyrics ? 'Lyrics' : 'Notation'
  const previewText = isLyrics ? pairingLyricsText(chunk) : ''
  const notationAbc = !isLyrics && chunk ? buildAbcForNotationChunk(chunk) : ''
  const sourceTitle = chunk ? sourceItemTitle(chunk) : ''

  return (
    <div className={'scratchpad-composition-pairing-col scratchpad-composition-pairing-' + props.side}>
      <div className="scratchpad-composition-pairing-col-head">
        <div className="scratchpad-composition-pairing-col-title">{label}</div>
        <div className="scratchpad-composition-pairing-col-actions">
          <IconButton
            icons={icons}
            title={isLyrics ? 'Select lyrics from scratchpad' : 'Select notation from scratchpad'}
            onClick={props.onSelect}
          >
            {icons.search || '⌕'}
          </IconButton>
          {chunk && sourceItemIdForCompositionChunk(chunk) ? (
            <IconButton
              icons={icons}
              title="Edit source scratchpad item"
              onClick={props.onEdit}
            >
              {icons.pencil || '✎'}
            </IconButton>
          ) : null}
        </div>
      </div>
      {chunk ? (
        <div className="scratchpad-composition-pairing-side-content">
          <div className="scratchpad-composition-pairing-side-label">
            <strong>{chunk.label}</strong>
            {sourceTitle ? <span className="text-muted small ms-1">({sourceTitle})</span> : null}
          </div>
          {isLyrics ? (
            <div className="scratchpad-composition-readonly-preview">
              {previewSnippet(previewText, 280) || <span className="text-muted">Empty</span>}
            </div>
          ) : notationAbc ? (
            <div className="scratchpad-composition-pairing-preview">
              <NotationPreview
                abc={notationAbc}
                fitWidth={true}
                wrapToWidth={true}
                maxHeight="200px"
                className="scratchpad-composition-chunk-preview"
              />
            </div>
          ) : chunk.sourceKind === 'chord-sheet' && chunk.sourceText ? (
            <pre className="scratchpad-composition-chord-fallback small">{chunk.sourceText}</pre>
          ) : (
            <div className="text-muted small">No preview</div>
          )}
        </div>
      ) : (
        <div className="scratchpad-composition-pairing-empty">
          <span className="text-muted small">Nothing selected</span>
          <Button size="sm" variant="outline-primary" className="ms-2" onClick={props.onSelect}>
            Select
          </Button>
        </div>
      )}
    </div>
  )
}

export default function ScratchpadCompositionPairingsPanel(props) {
  const composition = props.composition || {}
  const tunebook = props.tunebook || {}
  const icons = tunebook.icons || {}

  const pairingRows = useMemo(function() {
    return buildCompositionPairingRows(composition)
  }, [composition])

  function openSourceEditor(chunk) {
    const sourceId = sourceItemIdForCompositionChunk(chunk)
    if (!sourceId || !props.onEditSource) return
    props.onEditSource(sourceId)
  }

  return (
    <div className="scratchpad-composition-pairings-panel">
      <div className="scratchpad-composition-pairings-head">
        <h5 className="scratchpad-composition-pairings-title">Pairings</h5>
      </div>
      <p className="scratchpad-composition-pairings-help text-muted small">
        Each pairing links a lyrics section with notation from your scratchpad.
        The composition tune updates when you select lyrics or notation, or after editing a source item.
      </p>

      {pairingRows.length === 0 ? (
        <div className="scratchpad-composition-pairings-empty">
          <p className="text-muted mb-0">No pairings yet. Use <strong>Add pairing</strong> in the toolbar above.</p>
        </div>
      ) : (
        <div className="scratchpad-composition-pairings-list">
          {pairingRows.map(function(row, index) {
            return (
              <div key={row.id} className="scratchpad-composition-pairing-block">
                <div className="scratchpad-composition-pairing-block-head">
                  <span className="scratchpad-composition-pairing-block-index">Pairing {index + 1}</span>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    title="Remove pairing"
                    onClick={function() {
                      if (props.onRemovePairing) props.onRemovePairing(row.id)
                    }}
                  >
                    ×
                  </Button>
                </div>
                <div className="scratchpad-composition-pairing-columns">
                  <PairingSide
                    side="lyrics"
                    icons={icons}
                    chunk={row.lyricsChunk}
                    onSelect={function() {
                      if (props.onSelectSide) props.onSelectSide(row.id, 'lyrics')
                    }}
                    onEdit={row.lyricsChunk ? function() { openSourceEditor(row.lyricsChunk) } : null}
                  />
                  <PairingSide
                    side="notation"
                    icons={icons}
                    chunk={row.notationChunk}
                    onSelect={function() {
                      if (props.onSelectSide) props.onSelectSide(row.id, 'notation')
                    }}
                    onEdit={row.notationChunk ? function() { openSourceEditor(row.notationChunk) } : null}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
