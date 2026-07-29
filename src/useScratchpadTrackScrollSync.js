import { useEffect } from 'react'

/**
 * Keeps the track panel lane list vertically scrolled in sync with waveform-playlist .playlist-tracks.
 */
export default function useScratchpadTrackScrollSync(panelScrollRef, editorRef, reloadKey) {
  useEffect(function() {
    const panel = panelScrollRef && panelScrollRef.current
    const editor = editorRef && editorRef.current
    if (!panel || !editor) return undefined

    const tracksEl = editor.querySelector('.playlist-tracks')
    if (!tracksEl) return undefined

    let syncing = false

    function syncFromTracks() {
      if (syncing) return
      syncing = true
      panel.scrollTop = tracksEl.scrollTop
      syncing = false
    }

    function syncFromPanel() {
      if (syncing) return
      syncing = true
      tracksEl.scrollTop = panel.scrollTop
      syncing = false
    }

    tracksEl.addEventListener('scroll', syncFromTracks, { passive: true })
    panel.addEventListener('scroll', syncFromPanel, { passive: true })
    syncFromTracks()

    return function() {
      tracksEl.removeEventListener('scroll', syncFromTracks)
      panel.removeEventListener('scroll', syncFromPanel)
    }
  }, [panelScrollRef, editorRef, reloadKey])
}
