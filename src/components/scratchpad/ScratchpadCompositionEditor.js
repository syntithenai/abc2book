import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, ListGroup } from 'react-bootstrap'
import { toast } from 'react-toastify'
import useAbcjsParser from '../../useAbcjsParser'
import { runNotationChecks } from '../../useNotationCheck'
import NotationIssuesPanel from '../NotationIssuesPanel'
import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import ScratchpadCompositionChunkPicker from './ScratchpadCompositionChunkPicker'
import ScratchpadCompositionAlignmentPanel from './ScratchpadCompositionAlignmentPanel'
import { updateScratchpadItem, createScratchpadItem } from '../../scratchpadStore'
import {
  assembleCompositionTune,
  applyEmbeddedChordAction,
  reorderCompositionChunks,
  setCompositionPairing,
} from '../../scratchpadCompositionAssembly'
import {
  createChordSheetNotationChunk,
  generateCompositionChunkId,
} from '../../scratchpadCompositionChordImport'
import { setPlainLyricLines } from '../../wLinesUtils'

function cloneComposition(composition) {
  return JSON.parse(JSON.stringify(composition || {}))
}

function sortChunks(chunks) {
  return (Array.isArray(chunks) ? chunks.slice() : []).sort(function(a, b) {
    return (Number(a && a.order) || 0) - (Number(b && b.order) || 0)
  })
}

function ChunkReorderButtons(props) {
  return (
    <div className="scratchpad-composition-chunk-reorder">
      <Button
        size="sm"
        variant="outline-secondary"
        title="Move up"
        disabled={props.disableUp}
        onClick={function() { props.onReorder('up') }}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="outline-secondary"
        title="Move down"
        disabled={props.disableDown}
        onClick={function() { props.onReorder('down') }}
      >
        ↓
      </Button>
    </div>
  )
}

export default function ScratchpadCompositionEditor(props) {
  const item = props.item
  const tunebook = props.tunebook
  const tunes = props.tunes || {}
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [composition, setComposition] = useState(function() {
    return cloneComposition(item.composition)
  })
  const [reassemblyConfirm, setReassemblyConfirm] = useState(false)

  useEffect(function() {
    setComposition(cloneComposition(item.composition))
  }, [item && item.id, item && item.composition && item.composition.tuneSnapshot])

  const workingTune = composition.tuneSnapshot

  const checkResults = useMemo(function() {
    if (!workingTune) return { issues: [] }
    const abcTools = tunebook && tunebook.abcTools
    return runNotationChecks(workingTune, {
      abcTools: abcTools,
      abcText: abcTools ? abcTools.json2abc(workingTune) : '',
      skipRenderAbc: true,
    })
  }, [workingTune, tunebook])

  const persistComposition = useCallback(function(nextComposition, options) {
    const opts = options || {}
    const payload = cloneComposition(nextComposition)
    setComposition(payload)
    updateScratchpadItem(item.id, {
      composition: payload,
      title: opts.title || item.title,
    })
    if (props.onChange) props.onChange()
  }, [item.id, item.title, props.onChange])

  function runAssembly(nextComposition, options) {
    const opts = options || {}
    try {
      const assembled = assembleCompositionTune(nextComposition, {
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        mergeLyrics: opts.mergeLyrics,
      })
      const merged = cloneComposition(nextComposition)
      merged.tuneSnapshot = assembled
      merged.assemblyStale = false
      persistComposition(merged)
      return merged
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not assemble composition')
      return null
    }
  }

  function requestReassembly(nextComposition) {
    if (composition.assemblyStale && !reassemblyConfirm) {
      setReassemblyConfirm(true)
      return
    }
    setReassemblyConfirm(false)
    runAssembly(nextComposition)
  }

  function handleAddLyricsChunk(chunkDraft) {
    const next = cloneComposition(composition)
    next.lyricsChunks = (next.lyricsChunks || []).concat(chunkDraft)
    next.assemblyStale = true
    if (composition.assemblyStale) {
      persistComposition(next)
      requestReassembly(next)
    } else {
      runAssembly(next)
    }
  }

  function handleAddChordSheetChunk(payload) {
    const result = createChordSheetNotationChunk(payload.text, {
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      title: payload.label,
      label: payload.label,
      sourceItemId: payload.sourceItemId,
      sourceBlockId: payload.sourceBlockId,
      sectionIndex: payload.sectionIndex,
      chordMode: payload.chordMode,
      order: payload.order,
    })
    if (!result.ok) {
      toast.error(result.error && result.error.message ? result.error.message : 'Could not add chord sheet')
      return
    }
    const next = cloneComposition(composition)
    next.notationChunks = (next.notationChunks || []).concat(result.chunk)
    next.assemblyStale = true
    runAssembly(next)
  }

  function handleAddNotationStrainChunk(payload) {
    const chunk = {
      id: generateCompositionChunkId(),
      sourceKind: 'notation-strain',
      sourceItemId: payload.sourceItemId,
      strainIndex: payload.strainIndex,
      label: payload.label || 'Strain',
      order: payload.order,
      enabled: true,
    }
    const next = cloneComposition(composition)
    next.notationChunks = (next.notationChunks || []).concat(chunk)
    next.assemblyStale = true
    runAssembly(next)
  }

  function handleEmbeddedChordAction(action, pending) {
    const result = applyEmbeddedChordAction(composition, action, {
      text: pending.text,
      lyricsChunk: pending.chunkDraft,
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      sourceItemId: pending.chunkDraft && pending.chunkDraft.sourceItemId,
      sourceBlockId: pending.chunkDraft && pending.chunkDraft.sourceBlockId,
      sectionIndex: pending.chunkDraft && pending.chunkDraft.sectionIndex,
      label: pending.chunkDraft && pending.chunkDraft.label,
    })
    if (!result.ok) {
      toast.error(result.error && result.error.message ? result.error.message : 'Could not apply chord action')
      return
    }
    const next = result.composition
    next.assemblyStale = true
    runAssembly(next)
  }

  function toggleChunkEnabled(kind, chunkId, enabled) {
    const next = cloneComposition(composition)
    const listKey = kind === 'lyrics' ? 'lyricsChunks' : 'notationChunks'
    next[listKey] = (next[listKey] || []).map(function(chunk) {
      if (chunk.id !== chunkId) return chunk
      return Object.assign({}, chunk, { enabled: enabled })
    })
    next.assemblyStale = true
    runAssembly(next)
  }

  function removeChunk(kind, chunkId) {
    const next = cloneComposition(composition)
    const listKey = kind === 'lyrics' ? 'lyricsChunks' : 'notationChunks'
    next[listKey] = (next[listKey] || []).filter(function(chunk) { return chunk.id !== chunkId })
    next.pairings = (next.pairings || []).filter(function(pair) {
      return pair.lyricsChunkId !== chunkId && pair.notationChunkId !== chunkId
    })
    next.assemblyStale = true
    runAssembly(next)
  }

  function handleLyricsEdit(chunkId, text) {
    const next = cloneComposition(composition)
    next.assemblyStale = true
    setPlainLyricLines(next.tuneSnapshot, String(text || '').split(/\r?\n/))
    persistComposition(next)
  }

  function handleChunkReorder(kind, chunkId, direction) {
    const next = reorderCompositionChunks(composition, kind, chunkId, direction)
    if (next === composition) return
    next.assemblyStale = true
    runAssembly(next)
  }

  function handlePairingChange(lyricsChunkId, notationChunkId) {
    const next = setCompositionPairing(composition, lyricsChunkId, notationChunkId)
    next.assemblyStale = true
    runAssembly(next)
  }

  function handleTuneSavedFromFix(nextTune) {
    if (!nextTune) return
    const next = cloneComposition(composition)
    next.tuneSnapshot = nextTune
    next.assemblyStale = true
    persistComposition(next)
  }

  async function handleSaveAsNotation() {
    try {
      const created = await createScratchpadItem({
        workspaceId: item.workspaceId,
        type: 'notation',
        title: (workingTune && workingTune.name) || item.title || 'Composition export',
        tuneSnapshot: JSON.parse(JSON.stringify(workingTune)),
      })
      toast.success('Saved as notation item')
      if (created && created.id && props.onOpenItem) props.onOpenItem(created.id)
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not save notation item')
    }
  }

  const lyricsChunks = sortChunks(composition.lyricsChunks || [])
  const notationChunks = sortChunks(composition.notationChunks || [])

  return (
    <div className="scratchpad-composition-editor">
      <ScratchpadEditorChrome
        item={item}
        tunebook={tunebook}
        tunes={tunes}
        token={props.token}
        onChange={props.onChange}
        onDeleted={props.onDeleted}
        onBack={props.onBack}
        extraUseActions={[
          { id: 'save-notation', label: 'Save as notation item', onClick: handleSaveAsNotation },
        ]}
        onOpenItem={props.onOpenItem}
      />
      {reassemblyConfirm ? (
        <Alert variant="warning" className="m-2">
          The working tune was edited manually. Re-assemble from chunks?
          <div className="mt-2">
            <Button size="sm" variant="primary" onClick={function() { requestReassembly(composition) }}>
              Re-assemble
            </Button>
            <Button size="sm" variant="outline-secondary" className="ms-2" onClick={function() { setReassemblyConfirm(false) }}>
              Keep edits
            </Button>
          </div>
        </Alert>
      ) : null}
      <div className="scratchpad-composition-layout">
        <div className="scratchpad-composition-sidebar">
          <h6>Sources</h6>
          <ScratchpadCompositionChunkPicker
            itemId={item.id}
            workspaceId={item.workspaceId}
            composition={composition}
            onAddLyricsChunk={handleAddLyricsChunk}
            onAddChordSheetChunk={handleAddChordSheetChunk}
            onAddNotationStrainChunk={handleAddNotationStrainChunk}
            onEmbeddedChordAction={handleEmbeddedChordAction}
          />
          <h6 className="mt-3">Selected chunks</h6>
          <p className="text-muted small">Order here sets default lyrics ↔ notation pairing.</p>
          <ListGroup className="scratchpad-composition-chunk-list">
            {lyricsChunks.map(function(chunk, index) {
              return (
                <ListGroup.Item key={chunk.id} className="scratchpad-composition-chunk-item">
                  <div className="scratchpad-composition-chunk-item-head">
                    <Form.Check
                      type="checkbox"
                      checked={chunk.enabled !== false}
                      onChange={function(e) { toggleChunkEnabled('lyrics', chunk.id, e.target.checked) }}
                      label={(index + 1) + '. Lyrics: ' + chunk.label}
                    />
                    <div className="scratchpad-composition-chunk-item-actions">
                      <ChunkReorderButtons
                        disableUp={index === 0}
                        disableDown={index === lyricsChunks.length - 1}
                        onReorder={function(dir) { handleChunkReorder('lyrics', chunk.id, dir) }}
                      />
                      <Button size="sm" variant="outline-danger" onClick={function() { removeChunk('lyrics', chunk.id) }}>×</Button>
                    </div>
                  </div>
                  {chunk.plainLyricsOnly ? <span className="badge bg-secondary">plain lyrics</span> : null}
                </ListGroup.Item>
              )
            })}
            {notationChunks.map(function(chunk, index) {
              return (
                <ListGroup.Item key={chunk.id} className="scratchpad-composition-chunk-item">
                  <div className="scratchpad-composition-chunk-item-head">
                    <Form.Check
                      type="checkbox"
                      checked={chunk.enabled !== false}
                      onChange={function(e) { toggleChunkEnabled('notation', chunk.id, e.target.checked) }}
                      label={(index + 1) + '. Notation: ' + chunk.label + (chunk.chordMode ? ' (' + chunk.chordMode + ')' : '')}
                    />
                    <div className="scratchpad-composition-chunk-item-actions">
                      <ChunkReorderButtons
                        disableUp={index === 0}
                        disableDown={index === notationChunks.length - 1}
                        onReorder={function(dir) { handleChunkReorder('notation', chunk.id, dir) }}
                      />
                      <Button size="sm" variant="outline-danger" onClick={function() { removeChunk('notation', chunk.id) }}>×</Button>
                    </div>
                  </div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
          <Button size="sm" variant="outline-primary" className="mt-2" onClick={function() { runAssembly(composition) }}>
            Re-assemble
          </Button>
        </div>
        <div className="scratchpad-composition-main">
          <ScratchpadCompositionAlignmentPanel
            composition={composition}
            onLyricsChange={handleLyricsEdit}
            onPairingChange={handlePairingChange}
          />
        </div>
        <div className="scratchpad-composition-issues">
          <NotationIssuesPanel
            inline={true}
            tune={workingTune}
            tunebook={tunebook}
            issues={checkResults.issues}
            checkResults={checkResults}
            parseAndRender={abcjsParser.parseAndRender}
            onTuneSaved={handleTuneSavedFromFix}
          />
        </div>
      </div>
    </div>
  )
}
