import { useMemo } from 'react'
import MusicEditor from '../MusicEditor'
import { updateScratchpadItem, getScratchpadItem, blankNotationTune } from '../../scratchpadStore'

function ScratchpadEmbeddedMusicEditor(props) {
  return (
    <MusicEditor
      embedded={true}
      notationOnly={true}
      tuneId={props.tuneId}
      tune={props.tune}
      tunes={props.tunes}
      tunebook={props.tunebook}
      token={props.token}
      forceRefresh={props.forceRefresh}
      editHistory={props.editHistory}
      onLiveSave={props.onLiveSave}
      mediaController={props.mediaController}
      blockKeyboardShortcuts={props.blockKeyboardShortcuts}
      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      initialView={props.initialView}
    />
  )
}

/**
 * Embedded MusicEditor for scratchpad notation items (no nested Router).
 */
export default function ScratchpadMusicEditor(props) {
  const item = props.item
  const payloadKey = props.payloadKey || 'notation'
  const initialView = props.initialView || 'music'

  const tune = useMemo(function() {
    const payload = item && item[payloadKey]
    if (payload && payload.tuneSnapshot && payload.tuneSnapshot.id) {
      return payload.tuneSnapshot
    }
    return blankNotationTune(item && item.id, item && item.title)
  }, [item, payloadKey])

  const scratchpadTunebook = useMemo(function() {
    if (!tune || !tune.id || !props.tunebook) return props.tunebook
    const base = props.tunebook
    const itemId = item.id
    return Object.assign({}, base, {
      fromSelection: function(selection) {
        const current = getScratchpadItem(itemId)
        const payload = current && current[payloadKey]
        const snapshot = payload && payload.tuneSnapshot
          ? payload.tuneSnapshot
          : tune
        if (selection && snapshot && selection[snapshot.id]) return [snapshot]
        if (typeof base.fromSelection === 'function') {
          return base.fromSelection(selection)
        }
        return []
      },
      saveTune: function(savedTune, skipTimestamp, options) {
        const current = getScratchpadItem(itemId)
        const currentPayload = current && current[payloadKey] ? current[payloadKey] : {}
        const before = currentPayload.tuneSnapshot
          ? JSON.parse(JSON.stringify(currentPayload.tuneSnapshot))
          : null
        const next = Object.assign({}, savedTune, { id: itemId, words: [] })
        if (props.editHistory && before) {
          props.editHistory.recordChange({
            tuneId: itemId,
            label: (options && options.historyLabel) || 'Edit',
            before: before,
            after: JSON.parse(JSON.stringify(next)),
          })
        }
        const patch = {}
        patch[payloadKey] = Object.assign({}, currentPayload, { tuneSnapshot: next })
        updateScratchpadItem(itemId, Object.assign(patch, {
          title: next.name || (current && current.title) || item.title,
        }))
        return Promise.resolve(next)
      },
    })
  }, [props.tunebook, item.id, item.title, tune, payloadKey, props.editHistory])

  if (!item || !item.id) return <div className="p-3">Missing music data.</div>

  const tunesMap = Object.assign({}, props.tunes || {}, { [item.id]: tune })

  return (
    <div className="scratchpad-music-editor">
      <ScratchpadEmbeddedMusicEditor
        tuneId={item.id}
        tune={tune}
        tunes={tunesMap}
        tunebook={scratchpadTunebook}
        token={props.token}
        forceRefresh={props.onChange}
        mediaController={props.mediaController}
        blockKeyboardShortcuts={props.blockKeyboardShortcuts}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        searchIndex={props.searchIndex}
        loadTuneTexts={props.loadTuneTexts}
        editHistory={props.editHistory}
        onLiveSave={props.onChange}
        initialView={initialView}
      />
    </div>
  )
}
