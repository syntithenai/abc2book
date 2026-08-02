import { useEffect, useMemo, useState } from 'react'
import { Button, Form, ListGroup, Modal } from 'react-bootstrap'
import {
  listScratchpadItemsForWorkspaceFilter,
  scratchpadItemSearchHaystack,
  sortScratchpadItemsByUpdatedAt,
} from '../../scratchpadListSearch'
import { getScratchpadItem, listWorkspaces } from '../../scratchpadStore'
import { getTuneVoiceKeys } from '../../abcVoiceViewSettings'
import { sectionDisplayTitle } from '../../lyricStructureUtils'
import {
  sectionHasImportableChordContent,
  sectionTextForChunk,
  sectionTextFromItem,
  generateCompositionChunkId,
  lyricSectionHasMarkerHeader,
  analyzeTextForCompositionSelect,
} from '../../scratchpadCompositionChordImport'
import {
  textScratchpadItemPreviewLines,
  notationScratchpadItemPreviewLines,
  assignedNotationSourceItemIds,
  sortScratchpadItemsForNotationSelect,
} from '../../scratchpadCompositionUiUtils'
import { listNotationStrainsForItem } from '../../scratchpadCompositionNotation'
import ScratchpadCompositionVoiceSelectModal from './ScratchpadCompositionVoiceSelectModal'

function wholeTextChunkDraft(item) {
  return {
    sourceKind: 'text-section',
    sourceItemId: item.id,
    wholeItem: true,
  }
}

function textItemHasChordContent(item) {
  if (!item || item.type !== 'text') return false
  const text = sectionTextForChunk(item, wholeTextChunkDraft(item))
  return sectionHasImportableChordContent(text)
}

function TextImportActionButtons(props) {
  const analysis = props.analysis
  if (!analysis) return null
  const sectionLabel = props.sectionLabel
  const buttons = []

  if (analysis.isChordOnly) {
    buttons.push(
      <Button
        key="chords"
        size="sm"
        variant="primary"
        onClick={props.onChords}
      >
        {sectionLabel ? sectionLabel + ' · chords' : 'Import chords'}
      </Button>
    )
  } else {
    if (analysis.hasLyrics) {
      buttons.push(
        <Button
          key="lyrics"
          size="sm"
          variant={sectionLabel ? 'outline-primary' : 'primary'}
          onClick={props.onLyrics}
        >
          {sectionLabel ? sectionLabel + ' · lyrics' : 'All lyrics'}
        </Button>
      )
    }
    if (analysis.hasChords) {
      buttons.push(
        <Button
          key="chords"
          size="sm"
          variant={sectionLabel || !analysis.hasLyrics ? 'outline-primary' : 'primary'}
          onClick={props.onChords}
        >
          {sectionLabel ? sectionLabel + ' · chords' : 'All chords'}
        </Button>
      )
    }
  }

  if (!buttons.length) return null
  return buttons
}

function TextSelectItemRow(props) {
  const item = props.item
  const previewLines = props.previewLines || []
  const body = item.text && item.text.body || ''
  const wholeAnalysis = analyzeTextForCompositionSelect(body)
  const sectionEntries = []

  wholeAnalysis.sections.forEach(function(section, sectionIndex) {
    const isMarked = lyricSectionHasMarkerHeader(section)
    if (!isMarked && wholeAnalysis.sections.length <= 1) return
    if (!isMarked && sectionIndex === 0 && wholeAnalysis.markedSections.length) return
    sectionEntries.push({
      section: section,
      sectionIndex: sectionIndex,
      label: sectionDisplayTitle(section),
    })
  })

  return (
    <ListGroup.Item className="scratchpad-composition-select-row scratchpad-composition-select-text-row">
      <div className="scratchpad-composition-select-title">{item.title || 'Untitled'}</div>
      {previewLines.map(function(line, index) {
        return (
          <div key={index} className="scratchpad-composition-select-preview-line text-muted small">
            {line}
          </div>
        )
      })}
      <div className="scratchpad-composition-select-text-actions">
        <TextImportActionButtons
          analysis={wholeAnalysis}
          onLyrics={function() { props.onImportLyrics(item) }}
          onChords={function() { props.onImportChords(item) }}
        />
        {sectionEntries.map(function(entry) {
          const sectionText = sectionTextFromItem(item, entry.sectionIndex)
          const sectionAnalysis = analyzeTextForCompositionSelect(sectionText)
          return (
            <TextImportActionButtons
              key={item.id + '-section-' + entry.sectionIndex}
              analysis={sectionAnalysis}
              sectionLabel={entry.label}
              onLyrics={function() {
                props.onImportLyrics(item, entry.section, entry.sectionIndex)
              }}
              onChords={function() {
                props.onImportChords(item, entry.section, entry.sectionIndex)
              }}
            />
          )
        })}
      </div>
    </ListGroup.Item>
  )
}

function ChordTextSelectItemRow(props) {
  const item = props.item
  const previewLines = props.previewLines || []
  const body = item.text && item.text.body || ''
  const wholeAnalysis = analyzeTextForCompositionSelect(body)
  const sectionEntries = []

  wholeAnalysis.sections.forEach(function(section, sectionIndex) {
    const isMarked = lyricSectionHasMarkerHeader(section)
    if (!isMarked && wholeAnalysis.sections.length <= 1) return
    if (!isMarked && sectionIndex === 0 && wholeAnalysis.markedSections.length) return
    sectionEntries.push({
      section: section,
      sectionIndex: sectionIndex,
      label: sectionDisplayTitle(section),
    })
  })

  const rowClass = ['scratchpad-composition-select-row', 'scratchpad-composition-select-text-row']
  if (props.highlighted) rowClass.push('scratchpad-composition-select-row--paired')

  return (
    <ListGroup.Item className={rowClass.join(' ')}>
      <div className="scratchpad-composition-select-title-row">
        <div className="scratchpad-composition-select-title">{item.title || 'Untitled'}</div>
        {props.highlighted ? (
          <span className="scratchpad-composition-select-paired-badge">In pairing</span>
        ) : null}
      </div>
      {previewLines.map(function(line, index) {
        return (
          <div key={index} className="scratchpad-composition-select-preview-line text-muted small">
            {line}
          </div>
        )
      })}
      <div className="scratchpad-composition-select-text-actions">
        <TextImportActionButtons
          analysis={wholeAnalysis}
          onChords={function() { props.onImportChords(item) }}
        />
        {sectionEntries.map(function(entry) {
          const sectionText = sectionTextFromItem(item, entry.sectionIndex)
          const sectionAnalysis = analyzeTextForCompositionSelect(sectionText)
          return (
            <TextImportActionButtons
              key={item.id + '-section-' + entry.sectionIndex}
              analysis={sectionAnalysis}
              sectionLabel={entry.label}
              onChords={function() {
                props.onImportChords(item, entry.section, entry.sectionIndex)
              }}
            />
          )
        })}
      </div>
    </ListGroup.Item>
  )
}

function NotationSelectItemRow(props) {
  const item = props.item
  const previewLines = props.previewLines || []
  const strains = listNotationStrainsForItem(item)
  const rowClass = ['scratchpad-composition-select-row', 'scratchpad-composition-select-text-row']
  if (props.highlighted) rowClass.push('scratchpad-composition-select-row--paired')

  return (
    <ListGroup.Item className={rowClass.join(' ')}>
      <div className="scratchpad-composition-select-title-row">
        <div className="scratchpad-composition-select-title">{item.title || 'Untitled'}</div>
        {props.highlighted ? (
          <span className="scratchpad-composition-select-paired-badge">In pairing</span>
        ) : null}
      </div>
      {previewLines.map(function(line, index) {
        return (
          <div key={index} className="scratchpad-composition-select-preview-line text-muted small">
            {line}
          </div>
        )
      })}
      <div className="scratchpad-composition-select-text-actions">
        <Button
          size="sm"
          variant="primary"
          onClick={function() { props.onSelectAll(item) }}
        >
          Select all
        </Button>
        {strains.length > 1 ? strains.map(function(strain) {
          return (
            <Button
              key={item.id + '-strain-' + strain.index}
              size="sm"
              variant="outline-primary"
              onClick={function() { props.onSelectStrain(item, strain) }}
            >
              {strain.label}
            </Button>
          )
        }) : null}
      </div>
    </ListGroup.Item>
  )
}

export default function ScratchpadCompositionChunkSelectModal(props) {
  const composition = props.composition || {}
  const mode = props.mode === 'notation' ? 'notation' : 'lyrics'
  const [searchText, setSearchText] = useState('')
  const [workspaceFilterId, setWorkspaceFilterId] = useState('')
  const [workspaces, setWorkspaces] = useState([])
  const [voiceSelectPending, setVoiceSelectPending] = useState(null)

  useEffect(function() {
    if (!props.show) return
    setSearchText('')
    setWorkspaceFilterId('')
    setVoiceSelectPending(null)
    setWorkspaces(listWorkspaces())
  }, [props.show])

  const assignedNotationSourceIds = useMemo(function() {
    if (mode !== 'notation') return new Set()
    return assignedNotationSourceItemIds(composition)
  }, [composition, mode])

  const items = useMemo(function() {
    const list = sortScratchpadItemsByUpdatedAt(
      listScratchpadItemsForWorkspaceFilter(workspaceFilterId)
    )
    const q = String(searchText || '').trim().toLowerCase()
    const assignedSources = mode === 'notation'
      ? assignedNotationSourceItemIds(composition)
      : new Set()
    const filtered = list.filter(function(item) {
      if (!item || item.id === props.itemId) return false
      if (mode === 'lyrics') {
        if (item.type !== 'text') return false
      } else if (item.type === 'notation') {
        // notation items always eligible
      } else if (item.type === 'text') {
        if (!textItemHasChordContent(item)) return false
      } else {
        return false
      }
      if (mode === 'notation' && assignedSources.has(String(item.id))) {
        return true
      }
      if (!q) return true
      return scratchpadItemSearchHaystack(item).indexOf(q) >= 0
    })
    if (mode === 'notation') {
      return sortScratchpadItemsForNotationSelect(filtered, composition)
    }
    return filtered
  }, [workspaceFilterId, searchText, props.itemId, mode, composition])

  function closeModal() {
    setVoiceSelectPending(null)
    setSearchText('')
    if (props.onHide) props.onHide()
  }

  function importLyricsFromText(item, section, sectionIndex) {
    const isWhole = section == null
    const chunkDraft = {
      id: generateCompositionChunkId(),
      sourceKind: 'text-section',
      sourceItemId: item.id,
      wholeItem: isWhole,
      sectionIndex: isWhole ? undefined : sectionIndex,
      sectionMarker: isWhole ? '' : (section.header || ''),
      label: isWhole
        ? (item.title || 'Text')
        : (section.title || section.header || sectionDisplayTitle(section) || 'Section'),
      order: (composition.lyricsChunks || []).length,
      enabled: true,
    }
    const sectionText = isWhole
      ? sectionTextForChunk(item, chunkDraft)
      : sectionTextFromItem(item, sectionIndex)
    if (analyzeTextForCompositionSelect(sectionText).hasChords) {
      chunkDraft.plainLyricsOnly = true
    }
    if (props.onSelectLyricsChunk) props.onSelectLyricsChunk(chunkDraft)
    closeModal()
  }

  function importChordsFromText(item, section, sectionIndex) {
    const isWhole = section == null
    const text = isWhole
      ? sectionTextForChunk(item, wholeTextChunkDraft(item))
      : sectionTextFromItem(item, sectionIndex)
    const label = isWhole
      ? (item.title || 'Chord sheet')
      : (section.title || section.header || sectionDisplayTitle(section) || 'Section')
    const payload = {
      sourceItemId: item.id,
      wholeItem: isWhole,
      sectionIndex: isWhole ? undefined : sectionIndex,
      sectionMarker: isWhole ? '' : (section.header || ''),
      label: label,
      chordMode: 'chords-only',
      text: text,
      order: (composition.notationChunks || []).length,
    }
    if (props.onImportChords) {
      props.onImportChords(payload)
    } else if (props.onSelectChordSheet) {
      props.onSelectChordSheet(payload)
    }
    closeModal()
  }

  function finishNotationSelect(item, draft, voiceKeys) {
    if (!props.onSelectNotationStrain) return
    props.onSelectNotationStrain({
      sourceItemId: item.id,
      wholeItem: draft.wholeItem || false,
      strainIndex: draft.strainIndex,
      strainMarker: draft.strainMarker || '',
      label: draft.label || item.title || 'Notation',
      voiceKeys: voiceKeys,
      order: (composition.notationChunks || []).length,
    })
    closeModal()
  }

  function beginNotationSelect(item, draft) {
    const tune = item.notation && item.notation.tuneSnapshot
    const keys = getTuneVoiceKeys(tune)
    if (keys.length > 1) {
      setVoiceSelectPending({ item: item, draft: draft })
      return
    }
    finishNotationSelect(item, draft, keys)
  }

  function selectNotationAll(item) {
    beginNotationSelect(item, {
      wholeItem: true,
      label: item.title || 'Notation',
    })
  }

  function selectNotationStrain(item, strain) {
    beginNotationSelect(item, {
      wholeItem: false,
      strainIndex: strain.index,
      strainMarker: strain.marker || '',
      label: strain.label || 'Strain',
    })
  }

  function handleVoiceSelectConfirm(voiceKeys) {
    if (!voiceSelectPending) return
    finishNotationSelect(
      voiceSelectPending.item,
      voiceSelectPending.draft,
      voiceKeys
    )
    setVoiceSelectPending(null)
  }

  const title = mode === 'notation' ? 'Select notation' : 'Select text'

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
        <div className="scratchpad-composition-chunk-select-filters mb-3">
          <Form.Select
            size="sm"
            className="scratchpad-composition-chunk-select-workspace"
            aria-label="Filter scratchpad items by workspace"
            value={workspaceFilterId}
            onChange={function(e) { setWorkspaceFilterId(e.target.value) }}
          >
            <option value="">All workspaces</option>
            {workspaces.map(function(ws) {
              return <option key={ws.id} value={ws.id}>{ws.name}</option>
            })}
          </Form.Select>
          <Form.Control
            type="search"
            size="sm"
            className="scratchpad-composition-chunk-select-search"
            placeholder="Search scratchpad items…"
            value={searchText}
            onChange={function(e) { setSearchText(e.target.value) }}
          />
        </div>
        <ListGroup className="scratchpad-composition-select-list">
          {items.map(function(item) {
            const fresh = getScratchpadItem(item.id) || item
            if (mode === 'lyrics' && fresh.type === 'text') {
              return (
                <TextSelectItemRow
                  key={fresh.id}
                  item={fresh}
                  previewLines={textScratchpadItemPreviewLines(fresh)}
                  onImportLyrics={importLyricsFromText}
                  onImportChords={importChordsFromText}
                />
              )
            }
            if (mode === 'notation' && fresh.type === 'notation') {
              return (
                <NotationSelectItemRow
                  key={fresh.id}
                  item={fresh}
                  previewLines={notationScratchpadItemPreviewLines(fresh)}
                  highlighted={assignedNotationSourceIds.has(String(fresh.id))}
                  onSelectAll={selectNotationAll}
                  onSelectStrain={selectNotationStrain}
                />
              )
            }
            if (mode === 'notation' && fresh.type === 'text') {
              return (
                <ChordTextSelectItemRow
                  key={fresh.id}
                  item={fresh}
                  previewLines={textScratchpadItemPreviewLines(fresh)}
                  highlighted={assignedNotationSourceIds.has(String(fresh.id))}
                  onImportChords={importChordsFromText}
                />
              )
            }
            return null
          })}
        </ListGroup>
        {!items.length ? (
          <div className="text-muted small mt-2">No matching scratchpad items.</div>
        ) : null}
      </Modal.Body>
      <ScratchpadCompositionVoiceSelectModal
        show={!!voiceSelectPending}
        sourceTune={voiceSelectPending && voiceSelectPending.item
          ? voiceSelectPending.item.notation && voiceSelectPending.item.notation.tuneSnapshot
          : null}
        onHide={function() { setVoiceSelectPending(null) }}
        onConfirm={handleVoiceSelectConfirm}
      />
    </Modal>
  )
}
