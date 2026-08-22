import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../pageTitle'
import {
  getScratchpadItem,
  subscribeScratchpad,
  listWorkspaces,
} from '../scratchpadStore'
import ScratchpadItemToolbar from '../components/scratchpad/ScratchpadItemToolbar'
import ScratchpadTextEditor from '../components/scratchpad/ScratchpadTextEditor'
import ScratchpadImageEditor from '../components/scratchpad/ScratchpadImageEditor'
import ScratchpadNotationEditor from '../components/scratchpad/ScratchpadNotationEditor'
import ScratchpadAudioEditor from '../components/scratchpad/ScratchpadAudioEditor'
import ScratchpadCompositionEditor from '../components/scratchpad/ScratchpadCompositionEditor'

export default function ScratchpadItemPage(props) {
  const params = useParams()
  const navigate = useNavigate()
  const itemId = params.itemId
  const [item, setItem] = useState(function() { return getScratchpadItem(itemId) })
  const editHistory = props.editHistory

  useDocumentTitle(item ? item.title + ' — Scratchpad' : 'Scratchpad')

  const refresh = useCallback(function() {
    setItem(getScratchpadItem(itemId))
  }, [itemId])

  useEffect(function() {
    refresh()
    return subscribeScratchpad(refresh)
  }, [itemId, refresh])

  useEffect(function() {
    if (!item && listWorkspaces().length >= 0) {
      const current = getScratchpadItem(itemId)
      if (!current) navigate('/scratchpad', { replace: true })
    }
  }, [item, itemId, navigate])

  if (!item) {
    return <div className="scratchpad-page p-3">Loading…</div>
  }

  function renderEditor() {
    if (item.type === 'text') {
      return (
        <ScratchpadTextEditor
          key={item.id}
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          onChange={refresh}
          onDeleted={function() { navigate('/scratchpad') }}
          onBack={function() { navigate('/scratchpad') }}
        />
      )
    }
    if (item.type === 'image') {
      return (
        <ScratchpadImageEditor
          key={item.id}
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          login={props.login}
          onChange={refresh}
          onDeleted={function() { navigate('/scratchpad') }}
          onBack={function() { navigate('/scratchpad') }}
        />
      )
    }
    if (item.type === 'notation') {
      return (
        <ScratchpadNotationEditor
          key={item.id}
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          mediaController={props.mediaController}
          forceRefresh={props.forceRefresh}
          blockKeyboardShortcuts={props.blockKeyboardShortcuts}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          onChange={refresh}
          editHistory={editHistory}
        />
      )
    }
    if (item.type === 'composition') {
      return (
        <ScratchpadCompositionEditor
          key={item.id}
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          login={props.login}
          editHistory={editHistory}
          mediaController={props.mediaController}
          forceRefresh={props.forceRefresh}
          blockKeyboardShortcuts={props.blockKeyboardShortcuts}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          scratchpadSync={props.scratchpadSync}
          requestGoogleScopes={props.requestGoogleScopes}
          onChange={refresh}
          onDeleted={function() { navigate('/scratchpad') }}
          onBack={function() { navigate('/scratchpad') }}
          onOpenItem={function(itemId) { navigate('/scratchpad/' + encodeURIComponent(itemId)) }}
        />
      )
    }
    if (item.type === 'audio') {
      return (
        <ScratchpadAudioEditor
          key={item.id}
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          user={props.user}
          login={props.login}
          onChange={refresh}
          onDeleted={function() { navigate('/scratchpad') }}
          onBack={function() { navigate('/scratchpad') }}
        />
      )
    }
    return <div className="p-3">Unknown item type.</div>
  }

  return (
    <div className="scratchpad-item-page">
      {item.type === 'notation' ? (
        <ScratchpadItemToolbar
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          editHistory={editHistory}
          scratchpadSync={props.scratchpadSync}
          requestGoogleScopes={props.requestGoogleScopes}
          login={props.login}
          onChange={refresh}
          onDeleted={function() { navigate('/scratchpad') }}
          onBack={function() { navigate('/scratchpad') }}
        />
      ) : null}
      <div className="scratchpad-item-editor-area">
        {renderEditor()}
      </div>
    </div>
  )
}
