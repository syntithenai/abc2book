import { useCallback, useEffect, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { toast } from 'react-toastify'
import useAbcjsParser from '../../useAbcjsParser'
import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import ScratchpadCompositionPairingsPanel from './ScratchpadCompositionPairingsPanel'
import ScratchpadCompositionChunkSelectModal from './ScratchpadCompositionChunkSelectModal'
import ScratchpadCompositionSourceEditorModal from './ScratchpadCompositionSourceEditorModal'
import ScratchpadDriveSyncControl from './ScratchpadDriveSyncControl'
import { updateScratchpadItem, createScratchpadItem } from '../../scratchpadStore'
import {
  assembleCompositionTune,
  applyEmbeddedChordAction,
  normalizeCompositionPairingRows,
  addCompositionPairingRow,
  removeCompositionPairingRow,
  assignLyricsChunkToPairingRow,
  assignNotationChunkToPairingRow,
} from '../../scratchpadCompositionAssembly'
import {
  createChordSheetNotationChunk,
  generateCompositionChunkId,
} from '../../scratchpadCompositionChordImport'
import useScratchpadCompositionHistory from '../../useScratchpadCompositionHistory'

function cloneComposition(composition) {
  return JSON.parse(JSON.stringify(composition || {}))
}

export default function ScratchpadCompositionEditor(props) {
  const item = props.item
  const tunebook = props.tunebook
  const tunes = props.tunes || {}
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const history = useScratchpadCompositionHistory()
  const [composition, setComposition] = useState(function() {
    return normalizeCompositionPairingRows(cloneComposition(item.composition))
  })
  const [reassemblyConfirm, setReassemblyConfirm] = useState(false)
  const [sourceEditorId, setSourceEditorId] = useState(null)
  const [selectModal, setSelectModal] = useState(null)

  useEffect(function() {
    setComposition(normalizeCompositionPairingRows(cloneComposition(item.composition)))
    history.reset()
  }, [item && item.id])

  const workingTune = composition.tuneSnapshot

  const persistComposition = useCallback(function(nextComposition, options) {
    const opts = options || {}
    const normalized = normalizeCompositionPairingRows(cloneComposition(nextComposition))
    setComposition(normalized)
    updateScratchpadItem(item.id, {
      composition: normalized,
      title: opts.title || item.title,
    })
    if (props.onChange) props.onChange()
  }, [item.id, item.title, props.onChange])

  function runAssembly(nextComposition, options) {
    const opts = options || {}
    try {
      const normalized = normalizeCompositionPairingRows(nextComposition)
      const assembled = assembleCompositionTune(normalized, {
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        mergeLyrics: opts.mergeLyrics,
      })
      const merged = cloneComposition(normalized)
      merged.tuneSnapshot = assembled
      merged.assemblyStale = false
      persistComposition(merged)
      return merged
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not assemble composition')
      return null
    }
  }

  function applyCompositionMutation(mutator, options) {
    const opts = options || {}
    history.record(composition)
    const next = mutator(cloneComposition(composition))
    if (!next) return null
    next.assemblyStale = true
    if (opts.assemble) {
      return runAssembly(next, opts)
    }
    persistComposition(next)
    return next
  }

  function requestReassembly(nextComposition) {
    if (composition.assemblyStale && !reassemblyConfirm) {
      setReassemblyConfirm(true)
      return
    }
    setReassemblyConfirm(false)
    runAssembly(nextComposition)
  }

  function handleUndo() {
    const previous = history.undo(composition)
    if (!previous) return
    runAssembly(normalizeCompositionPairingRows(previous))
  }

  function handleRedo() {
    const next = history.redo(composition)
    if (!next) return
    runAssembly(normalizeCompositionPairingRows(next))
  }

  function handleAddPairing() {
    applyCompositionMutation(function(next) {
      return addCompositionPairingRow(next)
    })
  }

  function handleRemovePairing(pairingId) {
    applyCompositionMutation(function(next) {
      return removeCompositionPairingRow(next, pairingId)
    }, { assemble: true })
  }

  function handleSelectSide(pairingId, side) {
    setSelectModal({
      pairingId: pairingId,
      side: side === 'notation' ? 'notation' : 'lyrics',
    })
  }

  function handleSelectLyricsChunk(chunkDraft) {
    if (!selectModal || !selectModal.pairingId) return
    applyCompositionMutation(function(next) {
      return assignLyricsChunkToPairingRow(next, selectModal.pairingId, chunkDraft)
    }, { assemble: true })
    setSelectModal(null)
  }

  function handleSelectChordSheet(payload) {
    if (!selectModal || !selectModal.pairingId) return
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
    applyCompositionMutation(function(next) {
      return assignNotationChunkToPairingRow(next, selectModal.pairingId, result.chunk)
    }, { assemble: true })
    setSelectModal(null)
  }

  function handleSelectNotationStrain(payload) {
    if (!selectModal || !selectModal.pairingId) return
    const chunk = {
      id: generateCompositionChunkId(),
      sourceKind: 'notation-strain',
      sourceItemId: payload.sourceItemId,
      strainIndex: payload.strainIndex,
      label: payload.label || 'Strain',
      order: payload.order,
      enabled: true,
    }
    applyCompositionMutation(function(next) {
      return assignNotationChunkToPairingRow(next, selectModal.pairingId, chunk)
    }, { assemble: true })
    setSelectModal(null)
  }

  function handleEmbeddedChordAction(action, pending) {
    const pairingId = selectModal && selectModal.pairingId
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
    applyCompositionMutation(function(next) {
      let merged = cloneComposition(result.composition)
      if (pairingId && pending.chunkDraft) {
        const lyricsChunk = merged.lyricsChunks.find(function(chunk) {
          return chunk && chunk.id === pending.chunkDraft.id
        }) || pending.chunkDraft
        merged = assignLyricsChunkToPairingRow(merged, pairingId, lyricsChunk)
      }
      if (pairingId && result.notationChunk) {
        merged = assignNotationChunkToPairingRow(merged, pairingId, result.notationChunk)
      }
      return merged
    }, { assemble: true })
    setSelectModal(null)
  }

  function handleSourceChanged() {
    applyCompositionMutation(function(next) {
      return next
    }, { assemble: true })
    if (props.onChange) props.onChange()
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

  return (
    <div className="scratchpad-composition-editor scratchpad-composition-editor--pairings">
      <ScratchpadEditorChrome
        item={item}
        tunebook={tunebook}
        tunes={tunes}
        token={props.token}
        login={props.login}
        scratchpadSync={props.scratchpadSync}
        requestGoogleScopes={props.requestGoogleScopes}
        onChange={props.onChange}
        onDeleted={props.onDeleted}
        onBack={props.onBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        beforeTitle={
          <Button size="sm" variant="primary" onClick={handleAddPairing}>
            Add pairing
          </Button>
        }
        extraUseActions={[
          { id: 'save-notation', label: 'Save as notation item', onClick: handleSaveAsNotation },
        ]}
        onOpenItem={props.onOpenItem}
      >
        <ScratchpadDriveSyncControl
          scratchpadSync={props.scratchpadSync}
          token={props.token}
          login={props.login}
          requestGoogleScopes={props.requestGoogleScopes}
          compact={true}
        />
      </ScratchpadEditorChrome>
      {reassemblyConfirm ? (
        <Alert variant="warning" className="m-2">
          The working tune was edited manually. Re-assemble from pairings?
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
      <div className="scratchpad-composition-pairings-page">
        <ScratchpadCompositionPairingsPanel
          composition={composition}
          tunebook={tunebook}
          onAddPairing={handleAddPairing}
          onRemovePairing={handleRemovePairing}
          onSelectSide={handleSelectSide}
          onEditSource={function(sourceId) { setSourceEditorId(sourceId) }}
        />
      </div>
      <ScratchpadCompositionChunkSelectModal
        show={!!selectModal}
        mode={selectModal && selectModal.side}
        itemId={item.id}
        workspaceId={item.workspaceId}
        composition={composition}
        onHide={function() { setSelectModal(null) }}
        onSelectLyricsChunk={handleSelectLyricsChunk}
        onSelectChordSheet={handleSelectChordSheet}
        onSelectNotationStrain={handleSelectNotationStrain}
        onEmbeddedChordAction={handleEmbeddedChordAction}
      />
      <ScratchpadCompositionSourceEditorModal
        show={!!sourceEditorId}
        sourceItemId={sourceEditorId}
        tunebook={tunebook}
        tunes={tunes}
        token={props.token}
        login={props.login}
        editHistory={props.editHistory}
        mediaController={props.mediaController}
        forceRefresh={props.forceRefresh}
        blockKeyboardShortcuts={props.blockKeyboardShortcuts}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        searchIndex={props.searchIndex}
        loadTuneTexts={props.loadTuneTexts}
        onSourceChanged={handleSourceChanged}
        onHide={function() { setSourceEditorId(null) }}
      />
    </div>
  )
}
