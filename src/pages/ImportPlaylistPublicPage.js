import { useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'
import axios from 'axios'
import { useNavigate, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../pageTitle'
import {
  curatedScrapeUrlForPlaylistRef,
  decodePlaylistPublicSharePayload,
  groupPlaylistPublicRefsByScrapeFile,
} from '../playlistPublicShare'
import { savePlaylist, queueFromSavedPlaylist } from '../savedPlaylistsStore'
import { stampSrcUrlOnImportResults } from '../syncSourceImportUtils'
import { OFFLINE_MESSAGE, isNavigatorOffline } from '../offlineNetwork'

const IMPORT_SOURCE_TIMEOUT_MS = 30000

function looksLikeAbc(text) {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.indexOf('<!DOCTYPE html') !== -1 || trimmed.indexOf('<html') !== -1) return false
  return /^(%abc|X:|T:)/im.test(trimmed)
}

function collectImportedTuneIds(results) {
  const ids = []
  const seen = {}
  function addBucket(bucket) {
    if (!bucket) return
    if (Array.isArray(bucket)) {
      bucket.forEach(function(tune) {
        const id = tune && tune.id != null ? String(tune.id) : ''
        if (!id || seen[id]) return
        seen[id] = true
        ids.push(id)
      })
      return
    }
    Object.keys(bucket).forEach(function(key) {
      const tune = bucket[key]
      const id = (tune && tune.id != null ? String(tune.id) : String(key)).trim()
      if (!id || seen[id]) return
      seen[id] = true
      ids.push(id)
    })
  }
  addBucket(results && results.inserts)
  addBucket(results && results.updates)
  addBucket(results && results.localUpdates)
  addBucket(results && results.duplicates)
  return ids
}

/**
 * Import a playlist encoded with published scrape tune refs (no Google login).
 */
export default function ImportPlaylistPublicPage({
  tunebook,
  tunes,
  tunesHydrated,
  setNowPlayingQueue,
}) {
  useDocumentTitle('Import shared playlist')
  const navigate = useNavigate()
  const params = useParams()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Loading shared playlist…')
  const [finished, setFinished] = useState(false)

  useEffect(function() {
    if (!tunesHydrated) return
    const decoded = decodePlaylistPublicSharePayload(params.payload)
    if (!decoded) {
      setError('This playlist share link is invalid or outdated.')
      return
    }
    if (isNavigatorOffline()) {
      setError(OFFLINE_MESSAGE)
      return
    }

    var cancelled = false
    const groups = groupPlaylistPublicRefsByScrapeFile(decoded.refs)
    const scrapeFiles = Object.keys(groups)
    const orderedIds = decoded.refs.map(function(ref) { return String(ref.tuneId) })

    async function run() {
      setStatus('Fetching published collections…')
      const availableIds = {}
      let latestTunes = tunes || {}

      for (let i = 0; i < scrapeFiles.length; i += 1) {
        if (cancelled) return
        const scrapeFile = scrapeFiles[i]
        const tuneIds = groups[scrapeFile]
        const sourceUrl = curatedScrapeUrlForPlaylistRef(scrapeFile)
        setStatus('Loading ' + scrapeFile + '…')
        let res
        try {
          res = await axios.get(sourceUrl, { timeout: IMPORT_SOURCE_TIMEOUT_MS })
        } catch (e) {
          throw new Error('Could not load published source ' + scrapeFile)
        }
        if (!res || !looksLikeAbc(res.data)) {
          throw new Error('Published source ' + scrapeFile + ' did not look like ABC')
        }

        let results
        try {
          results = tunebook.importAbc(
            res.data,
            null,
            null,
            null,
            null,
            tuneIds,
            { allowDuplicateTitles: true }
          )
        } catch (importErr) {
          console.error(importErr)
          throw new Error('Error parsing published source ' + scrapeFile)
        }

        const stamped = stampSrcUrlOnImportResults(results, sourceUrl)
        collectImportedTuneIds(stamped).forEach(function(id) {
          availableIds[id] = true
        })
        // Also count ids already present in the library that matched as duplicates.
        tuneIds.forEach(function(id) {
          if (latestTunes && latestTunes[id]) availableIds[id] = true
        })

        if (typeof tunebook.applyMergeData === 'function') {
          latestTunes = await tunebook.applyMergeData(stamped) || latestTunes
        } else if (typeof tunebook.applyImportData === 'function') {
          latestTunes = await tunebook.applyImportData(stamped) || latestTunes
        }
      }

      if (cancelled) return
      setStatus('Saving playlist…')

      const playlistItems = []
      orderedIds.forEach(function(id) {
        if (availableIds[id] || (latestTunes && latestTunes[id])) {
          playlistItems.push({ tuneId: id })
        }
      })
      if (!playlistItems.length) {
        throw new Error('None of the shared playlist tunes could be found in published collections.')
      }

      const saved = savePlaylist({
        name: decoded.name,
        items: playlistItems,
      })
      if (!saved) {
        throw new Error('Could not save the imported playlist.')
      }

      const queue = queueFromSavedPlaylist(saved, latestTunes || {})
      if (queue) {
        if (tunebook.startNowPlayingQueue) {
          tunebook.startNowPlayingQueue(queue, navigate, { startPlayback: false })
        } else if (typeof setNowPlayingQueue === 'function') {
          setNowPlayingQueue(queue)
        }
      }

      setFinished(true)
      navigate('/books', { replace: true })
    }

    run().catch(function(err) {
      if (cancelled) return
      console.error(err)
      setError((err && err.message) || 'Error importing shared playlist.')
    })

    return function() { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tunesHydrated, params.payload])

  if (finished) return null

  if (error) {
    return (
      <div className="p-4">
        <h3>Import playlist</h3>
        <p className="text-danger">{error}</p>
        <Button variant="secondary" onClick={function() { navigate('/books') }}>Back</Button>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h3>Import playlist</h3>
      <p>{status}</p>
    </div>
  )
}
