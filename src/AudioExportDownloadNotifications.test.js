/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AudioExportDownloadNotifications from './AudioExportDownloadNotifications'
import * as mediaCacheQueue from './mediaCacheQueue'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(function() { return 'toast-id' }),
      success: jest.fn(function() { return 'toast-id' }),
      error: jest.fn(function() { return 'toast-id' }),
      dismiss: jest.fn(),
    },
  }
})

jest.mock('./mediaExportUtils', function() {
  return {
    buildTuneMediaExportBlob: jest.fn(function() {
      return Promise.resolve({
        blob: new Blob(['audio'], { type: 'audio/mp4' }),
        audioFormat: 'aac',
      })
    }),
    buildTuneMediaExportFilename: jest.fn(function(tune, linkIndex) {
      return (tune && tune.name ? tune.name : 'tune') + '-link-' + (linkIndex + 1) + '-processed.m4a'
    }),
  }
})

describe('AudioExportDownloadNotifications', function() {
  let container
  let root

  beforeEach(function() {
    jest.clearAllMocks()
    if (mediaCacheQueue.__resetMediaCacheQueueForTests) {
      mediaCacheQueue.__resetMediaCacheQueueForTests()
    }
    global.URL.createObjectURL = jest.fn(function() { return 'blob:mock' })
    global.URL.revokeObjectURL = jest.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() {
      root.unmount()
    })
    container.remove()
    document.querySelectorAll('.audio-export-ready-toasts').forEach(function(node) {
      node.remove()
    })
  })

  async function waitForJobDone(tuneId) {
    let attempts = 0
    while (attempts < 50) {
      const job = mediaCacheQueue.getState().jobs.find(function(item) {
        return item.tuneId === tuneId
      })
      if (job && job.status === 'done') return job
      await new Promise(function(resolve) { setTimeout(resolve, 20) })
      attempts += 1
    }
    return null
  }

  test('shows finish toast and download panel when export job completes', async function() {
    const { toast } = require('react-toastify')

    act(function() {
      root.render(<AudioExportDownloadNotifications />)
    })

    const tune = { id: 't1', name: 'Wild Rover', links: [{ link: 'https://example.com/a.mp3' }] }
    mediaCacheQueue.enqueueDownloadJob({
      tuneId: 't1',
      linkIndex: 0,
      src: 'https://example.com/a.mp3',
      srcType: 'audio',
      tuneName: 'Wild Rover',
      tune: tune,
      filename: 'Wild Rover-link-1.m4a',
      audioFormat: 'aac',
      youtubeGetId: function() { return '' },
      accessToken: null,
      demucsModel: 'htdemucs',
    })

    mediaCacheQueue.start()

    await act(async function() {
      const job = await waitForJobDone('t1')
      expect(job).toBeTruthy()
      await new Promise(function(resolve) { setTimeout(resolve, 0) })
    })

    expect(toast.success).not.toHaveBeenCalled()
    expect(document.querySelector('.audio-export-ready-toast')).toBeTruthy()
    expect(document.querySelector('.audio-export-ready-toast .btn')).toBeTruthy()
  })
})
