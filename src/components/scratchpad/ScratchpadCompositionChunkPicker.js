import { useMemo, useState } from 'react'
import { Alert, Button, Form, ListGroup } from 'react-bootstrap'
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

function ChordImportButtons(props) {
  if (!props.show) return null
  return (
    <>
      <Button size="sm" variant="outline-secondary" onClick={props.onChordsOnly}>
        Chords
      </Button>
      <Button size="sm" variant="outline-secondary" onClick={props.onChordsAndLyrics}>
        Chords + lyrics
      </Button>
    </>
  )
}

export default function ScratchpadCompositionChunkPicker(props) {
  const workspaceId = props.workspaceId || ''
  const composition = props.composition || {}
  const [searchText, setSearchText] = useState('')
  const [pending, setPending] = useState(null)

  const items = useMemo(function() {
    const list = listScratchpadItemsForWorkspaceFilter(workspaceId)
    const q = String(searchText || '').trim().toLowerCase()
    return list.filter(function(item) {
      if (!item || item.id === props.itemId) return false
      if (item.type !== 'text' && item.type !== 'image' && item.type !== 'notation') return false
      if (!q) return true
      return scratchpadItemSearchHaystack(item).indexOf(q) >= 0
    })
  }, [workspaceId, searchText, props.itemId])

  function requestLyricsAdd(sourceItem, chunkDraft, text) {
    if (sectionHasImportableChordContent(text)) {
      setPending({
        mode: 'lyrics',
        sourceItem: sourceItem,
        chunkDraft: chunkDraft,
        text: text,
      })
      return
    }
    if (props.onAddLyricsChunk) props.onAddLyricsChunk(chunkDraft)
  }

  function finishPending(action) {
    if (!pending) return
    if (props.onEmbeddedChordAction) {
      props.onEmbeddedChordAction(action, pending)
    }
    setPending(null)
  }

  function addTextSectionAsLyrics(item, section, sectionIndex) {
    const chunkDraft = {
      id: generateCompositionChunkId(),
      sourceKind: 'text-section',
      sourceItemId: item.id,
      sectionIndex: sectionIndex,
      label: section.title || 'Section ' + (sectionIndex + 1),
      order: (composition.lyricsChunks || []).length,
      enabled: true,
    }
    const text = sectionTextFromItem(item, sectionIndex)
    requestLyricsAdd(item, chunkDraft, text)
  }

  function addTextSectionAsChordSheet(item, section, sectionIndex, chordMode) {
    const text = sectionTextFromItem(item, sectionIndex)
    if (props.onAddChordSheetChunk) {
      props.onAddChordSheetChunk({
        sourceItemId: item.id,
        sectionIndex: sectionIndex,
        sourceKind: 'text-section',
        label: section.title || 'Section ' + (sectionIndex + 1),
        chordMode: chordMode,
        text: text,
        order: (composition.notationChunks || []).length,
      })
    }
  }

  function addImageBlockAsLyrics(item, block) {
    const chunkDraft = {
      id: generateCompositionChunkId(),
      sourceKind: 'image-text-block',
      sourceItemId: item.id,
      sourceBlockId: block.id,
      label: String(block.text || 'Text block').slice(0, 40),
      order: (composition.lyricsChunks || []).length,
      enabled: true,
    }
    requestLyricsAdd(item, chunkDraft, block.text || '')
  }

  function addImageBlockAsChordSheet(item, block, chordMode) {
    if (props.onAddChordSheetChunk) {
      props.onAddChordSheetChunk({
        sourceItemId: item.id,
        sourceBlockId: block.id,
        sourceKind: 'image-text-block',
        label: String(block.text || 'Text block').slice(0, 40),
        chordMode: chordMode,
        text: block.text || '',
        order: (composition.notationChunks || []).length,
      })
    }
  }

  function addNotationStrain(item, strain, strainIndex) {
    if (props.onAddNotationStrainChunk) {
      props.onAddNotationStrainChunk({
        sourceItemId: item.id,
        strainIndex: strainIndex,
        label: strain.label,
        order: (composition.notationChunks || []).length,
      })
    }
  }

  return (
    <div className="scratchpad-composition-chunk-picker">
      <Form.Control
        type="search"
        size="sm"
        className="mb-2"
        placeholder="Search scratchpad…"
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
                  return (
                    <div key={fresh.id + '-section-' + index} className="scratchpad-composition-source-section">
                      <div className="scratchpad-composition-source-section-label">
                        {section.title}
                        {hasChords ? <span className="badge bg-secondary ms-1">chords</span> : null}
                      </div>
                      <div className="scratchpad-composition-source-actions">
                        <Button size="sm" variant="outline-secondary" onClick={function() { addTextSectionAsLyrics(fresh, section, index) }}>
                          Lyrics
                        </Button>
                        <ChordImportButtons
                          show={hasChords}
                          onChordsOnly={function() { addTextSectionAsChordSheet(fresh, section, index, 'chords-only') }}
                          onChordsAndLyrics={function() { addTextSectionAsChordSheet(fresh, section, index, 'chords-and-lyrics') }}
                        />
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
                  return (
                    <div key={block.id} className="scratchpad-composition-source-section">
                      <div className="scratchpad-composition-source-section-label">
                        {String(block.text || 'Text block').slice(0, 50)}
                        {hasChords ? <span className="badge bg-secondary ms-1">chords</span> : null}
                      </div>
                      <div className="scratchpad-composition-source-actions">
                        <Button size="sm" variant="outline-secondary" onClick={function() { addImageBlockAsLyrics(fresh, block) }}>
                          Lyrics
                        </Button>
                        <ChordImportButtons
                          show={hasChords}
                          onChordsOnly={function() { addImageBlockAsChordSheet(fresh, block, 'chords-only') }}
                          onChordsAndLyrics={function() { addImageBlockAsChordSheet(fresh, block, 'chords-and-lyrics') }}
                        />
                      </div>
                    </div>
                  )
                }) : <div className="text-muted small">No text blocks</div>}
              </ListGroup.Item>
            )
          }
          if (fresh.type === 'notation') {
            const strains = strainLabelsFromTune(fresh.notation && fresh.notation.tuneSnapshot)
            return (
              <ListGroup.Item key={fresh.id} className="scratchpad-composition-source-item">
                <div className="scratchpad-composition-source-title">{fresh.title} <span className="text-muted">notation</span></div>
                {strains.map(function(strain) {
                  return (
                    <div key={fresh.id + '-strain-' + strain.index} className="scratchpad-composition-source-section">
                      <div className="scratchpad-composition-source-section-label">{strain.label}</div>
                      <div className="text-muted small">{strain.preview}</div>
                      <Button size="sm" variant="outline-secondary" className="mt-1" onClick={function() { addNotationStrain(fresh, strain, strain.index) }}>
                        Add strain
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
    </div>
  )
}
