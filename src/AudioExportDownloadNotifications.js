import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-toastify'
import * as mediaCacheQueue from './mediaCacheQueue'
import { revokeReadyDownload, saveReadyDownload } from './offerBlobDownload'
import './AudioExportDownloadNotifications.css'

function isExportJobType(type) {
  return type === 'download' || type === 'processed-download'
}

function getQueueRevision() {
  return mediaCacheQueue.getSnapshotRevision()
}

export default function AudioExportDownloadNotifications() {
  const queueRevision = useSyncExternalStore(
    mediaCacheQueue.subscribe,
    getQueueRevision,
    function() { return '' }
  )
  const [readyItems, setReadyItems] = useState([])
  const notifiedDoneRef = useRef(new Set())
  const notifiedErrorRef = useRef(new Set())

  useEffect(function() {
    const state = mediaCacheQueue.getState()
    const nextItems = []

    state.jobs.forEach(function(job) {
      if (!isExportJobType(job.type)) return

      if (job.status === 'done' && job.awaitingSave) {
        if (notifiedDoneRef.current.has(job.id)) return
        const ready = mediaCacheQueue.claimJobReadyDownload(job.id)
        if (!ready) return
        notifiedDoneRef.current.add(job.id)
        nextItems.push({
          id: job.id,
          ready: ready,
          tuneName: job.tuneName || '',
          filename: ready.filename || job.filename || 'download',
        })
        return
      }

      if (job.status === 'error') {
        if (notifiedErrorRef.current.has(job.id)) return
        notifiedErrorRef.current.add(job.id)
        mediaCacheQueue.claimJobReadyDownload(job.id)
        toast.error(job.error || ('Could not prepare ' + (job.tuneName || 'audio')), { autoClose: 8000 })
      }
    })

    if (nextItems.length) {
      setReadyItems(function(prev) { return prev.concat(nextItems) })
    }
  }, [queueRevision])

  function dismissItem(item) {
    revokeReadyDownload(item.ready)
    setReadyItems(function(prev) {
      return prev.filter(function(entry) { return entry.id !== item.id })
    })
  }

  function downloadItem(item) {
    saveReadyDownload(item.ready)
    setReadyItems(function(prev) {
      return prev.filter(function(entry) { return entry.id !== item.id })
    })
  }

  if (!readyItems.length) return null

  return createPortal(
    <div className="audio-export-ready-toasts" role="status" aria-live="polite">
      {readyItems.map(function(item) {
        return (
          <div key={item.id} className="audio-export-ready-toast">
            <div className="audio-export-ready-toast-message">
              {item.tuneName ? item.tuneName + ': ' : ''}
              {item.filename} is ready.
            </div>
            <div className="audio-export-ready-toast-actions">
              <button
                type="button"
                className="btn btn-sm btn-light"
                onClick={function() { downloadItem(item) }}
              >
                Download
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={function() { dismissItem(item) }}
              >
                Discard
              </button>
            </div>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
