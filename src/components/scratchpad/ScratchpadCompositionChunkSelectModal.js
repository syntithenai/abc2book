import { useMemo, useState } from 'react'
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap'
import {
  listScratchpadItemsForWorkspaceFilter,
  scratchpadItemSearchHaystack,
} from '../../scratchpadListSearch'
import { getScratchpadItem } from '../../scratchpadStore'
import { listLyricSections } from '../../lyricStructureUtils'
import { splitMelodyStrainsWithBarlines } from '../../chordBlockMerge'
import { resolvePrimaryVoiceKey } from '../../abcVoiceUtils'
import {
  sectionHasImportableChordContent,
  sectionTextFromItem,
  imageBlockText,
  generateCompositionChunkId,
} from '../../scratchpadCompositionChordImport'

function strainLabelsFromTune(tuneSnapshot) {
  if (!tuneSnapshot || !tuneSnapshot.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tuneSnapshot.voices)
  const notes = tuneSnapshot.voices[voiceKey] && tuneSnapshot.voices[voiceKey].notes
  const strains = splitMelodyStrainsWithBarlines(Array.isArray(notes) ? notes : [])
  return strains.map(function(strain, index) {
    return {
      index: index,
      label: 'Strain ' + (index + 1),
      preview: String(strain.text || '').slice(0, 60),
    }
  })
}

function EmbeddedChordWarning(props) {
  if (!props.show) return null
  return (
    <Alert variant="warning" className="scratchpad-composition-chord-warning mt-2">
      <div>This text includes chord symbols. Plain lyrics import may lose chord placement.</div>
      <div className="scratchpad-composition-chord-warning-actions mt-2">
        <Button size="sm" variant="outline-primary" onClick={props.onChordPro}>
          Standardize to ChordPro
        </Button>
        <Button size="sm" variant="outline-secondary" onClick={props.onNotationBlock}>
          Create notation block from chords
        </Button>
        <Button size="sm" variant="outline-secondary" onClick={props.onPlain}>
          Import plain lyrics
        </Button>
      </div>
    </Alert>
  )
}

export default function ScratchpadCompositionChunkSelectModal(props) {
  const workspaceId = props.workspaceId || ''
  const composition = props.composition || {}
  const mode = props.mode === 'notation' ? 'notation' : 'lyrics'
  const [searchText, setSearchText] = useState('')
  const [pending, setPending] = useState(null)

  const items = useMemo(function() {
    const list = listScratchpadItemsForWorkspaceFilter(workspaceId)
    const q = String(searchText || '').trim().toLowerCase()
    return list.filter(function(item) {
      if (!item || item.id === props.itemId) return false
      if (item.type !== 'text' && item.type !== 'image' && item.type !== 'notation') return false
      if (mode === 'lyrics' && item.type === 'notation') return false
      if (mode === 'notation' && item.type !== 'notation' && item.type !== 'text' && item.type !== 'image') return false
      if (!q) return true
      return scratchpadItemSearchHaystack(item).indexOf(q) >= 0
    })
  }, [workspaceId, searchText, props.itemId, mode])

  function closeModal() {
    setPending(null)
    setSearchText('')
    if (props.onHide) props.onHide()
  }

  function selectLyricsChunk(chunkDraft, text) {
    if (sectionHasImportableChordContent(text)) {
      setPending({
        mode: 'lyrics',
        chunkDraft: chunkDraft,
        text: text,
      })
      return
    }
    if (props.onSelectLyricsChunk) props.onSelectLyricsChunk(chunkDraft)
    closeModal()
  }

  function finishPending(action) {
    if (!pending) return
    if (props.onEmbeddedChordAction) {
      props.onEmbeddedChordAction(action, pending)
    }
    setPending(null)
    closeModal()
  }

  function selectChordSheet(payload) {
    if (props.onSelectChordSheet) props.onSelectChordSheet(payload)
    closeModal()
  }

  function selectNotationStrain(payload) {
    if (props.onSelectNotationStrain) props.onSelectNotationStrain(payload)
    closeModal()
  }

  const title = mode === 'notation'
    ? 'Select notation from scratchpad'
    : 'Select lyrics from scratchpad'

  return (
    <Modal
      show={!!props.show}
      onHide={closeModal}
      size="lg"
      scrollable
      className="scratchpad-composition-chunk-select-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Control
          type="search"
          size="sm"
          className="mb-3"
          placeholder="Search scratchpad items…"
          value={searchText}
          onChange={function(e) { setSearchText(e.target.value) }}
        />
        {pending ? (
          <EmbeddedChordWarning
            show={true}
            onChordPro={function() { finishPending('chordpro') }}
            onNotationBlock={function() { finishPending('notation-block') }}
            onPlain={function() { finishPending('plain') }}
          />
        ) : null}
        <ListGroup className="scratchpad-composition-source-list">
          {items.map(function(item) {
            const fresh = getScratchpadItem(item.id) || item
            if (fresh.type === 'text') {
              const sections = listLyricSections(fresh.text && fresh.text.body || '')
              return (
                <ListGroup.Item key={fresh.id} className="scratchpad-composition-source-item">
                  <div className="scratchpad-composition-source-title">{fresh.title} <span className="text-muted">text</span></div>
                  {sections.map(function(section, index) {
                    const sectionText = sectionTextFromItem(fresh, index)
                    const hasChords = sectionHasImportableChordContent(sectionText)
                    const chunkDraft = {
                      id: generateCompositionChunkId(),
                      sourceKind: 'text-section',
                      sourceItemId: fresh.id,
                      sectionIndex: index,
                      label: section.title || 'Section ' + (index + 1),
                      order: (composition.lyricsChunks || []).length,
                      enabled: true,
                    }
                    return (
                      <div key={fresh.id + '-section-' + index} className="scratchpad-composition-source-section">
                        <div className="scratchpad-composition-source-section-label">
                          {section.title}
                          {hasChords ? <span className="badge bg-secondary ms-1">chords</span> : null}
                        </div>
                        <div className="scratchpad-composition-source-actions">
                          {mode === 'lyrics' ? (
                            <Button size="sm" variant="primary" onClick={function() { selectLyricsChunk(chunkDraft, sectionText) }}>
                              Use as lyrics
                            </Button>
                          ) : null}
                          {mode === 'notation' && hasChords ? (
                            <>
                              <Button size="sm" variant="outline-secondary" onClick={function() {
                                selectChordSheet({
                                  sourceItemId: fresh.id,
                                  sectionIndex: index,
                                  label: section.title || 'Section ' + (index + 1),
                                  chordMode: 'chords-only',
                                  text: sectionText,
                                  order: (composition.notationChunks || []).length,
                                })
                              }}>
                                Chords only
                              </Button>
                              <Button size="sm" variant="outline-secondary" onClick={function() {
                                selectChordSheet({
                                  sourceItemId: fresh.id,
                                  sectionIndex: index,
                                  label: section.title || 'Section ' + (index + 1),
                                  chordMode: 'chords-and-lyrics',
                                  text: sectionText,
                                  order: (composition.notationChunks || []).length,
                                })
                              }}>
                                Chords + lyrics
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </ListGroup.Item>
              )
            }
            if (fresh.type === 'image') {
              const blocks = (fresh.image && fresh.image.textBlocks) || []
              return (
                <ListGroup.Item key={fresh.id} className="scratchpad-composition-source-item">
                  <div className="scratchpad-composition-source-title">{fresh.title} <span className="text-muted">image</span></div>
                  {blocks.length ? blocks.map(function(block) {
                    const blockText = imageBlockText(fresh, block.id)
                    const hasChords = sectionHasImportableChordContent(blockText)
                    const chunkDraft = {
                      id: generateCompositionChunkId(),
                      sourceKind: 'image-text-block',
                      sourceItemId: fresh.id,
                      sourceBlockId: block.id,
                      label: String(block.text || 'Text block').slice(0, 40),
                      order: (composition.lyricsChunks || []).length,
                      enabled: true,
                    }
                    return (
                      <div key={block.id} className="scratchpad-composition-source-section">
                        <div className="scratchpad-composition-source-section-label">
                          {String(block.text || 'Text block').slice(0, 50)}
                          {hasChords ? <span className="badge bg-secondary ms-1">chords</span> : null}
                        </div>
                        <div className="scratchpad-composition-source-actions">
                          {mode === 'lyrics' ? (
                            <Button size="sm" variant="primary" onClick={function() { selectLyricsChunk(chunkDraft, blockText) }}>
                              Use as lyrics
                            </Button>
                          ) : null}
                          {mode === 'notation' && hasChords ? (
                            <>
                              <Button size="sm" variant="outline-secondary" onClick={function() {
                                selectChordSheet({
                                  sourceItemId: fresh.id,
                                  sourceBlockId: block.id,
                                  label: String(block.text || 'Text block').slice(0, 40),
                                  chordMode: 'chords-only',
                                  text: blockText,
                                  order: (composition.notationChunks || []).length,
                                })
                              }}>
                                Chords only
                              </Button>
                              <Button size="sm" variant="outline-secondary" onClick={function() {
                                selectChordSheet({
                                  sourceItemId: fresh.id,
                                  sourceBlockId: block.id,
                                  label: String(block.text || 'Text block').slice(0, 40),
                                  chordMode: 'chords-and-lyrics',
                                  text: blockText,
                                  order: (composition.notationChunks || []).length,
                                })
                              }}>
                                Chords + lyrics
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  }) : <div className="text-muted small">No text blocks</div>}
                </ListGroup.Item>
              )
            }
            if (fresh.type === 'notation' && mode === 'notation') {
              const strains = strainLabelsFromTune(fresh.notation && fresh.notation.tuneSnapshot)
              return (
                <ListGroup.Item key={fresh.id} className="scratchpad-composition-source-item">
                  <div className="scratchpad-composition-source-title">{fresh.title} <span className="text-muted">notation</span></div>
                  {strains.map(function(strain) {
                    return (
                      <div key={fresh.id + '-strain-' + strain.index} className="scratchpad-composition-source-section">
                        <div className="scratchpad-composition-source-section-label">{strain.label}</div>
                        <div className="text-muted small">{strain.preview}</div>
                        <Button
                          size="sm"
                          variant="primary"
                          className="mt-1"
                          onClick={function() {
                            selectNotationStrain({
                              sourceItemId: fresh.id,
                              strainIndex: strain.index,
                              label: strain.label,
                              order: (composition.notationChunks || []).length,
                            })
                          }}
                        >
                          Use strain
                        </Button>
                      </div>
                    )
                  })}
                </ListGroup.Item>
              )
            }
            return null
          })}
        </ListGroup>
        {!items.length ? (
          <div className="text-muted small mt-2">No matching scratchpad items.</div>
        ) : null}
      </Modal.Body>
    </Modal>
  )
}
