jest.mock('localforage', function() {
  return {
    createInstance: function() {
      return {
        setItem: function() { return Promise.resolve() },
        getItem: function() { return Promise.resolve(null) },
      }
    },
  }
})

jest.mock('./linkRecording', function() {
  return {
    createAttachedAudioLink: jest.fn(),
  }
})

jest.mock('./musicGenerationClient', function() {
  return {
    pollAudioGenerationJob: jest.fn(),
    downloadAudioGenerationResult: jest.fn(),
  }
})

jest.mock('./audioGenerationToast', function() {
  return {
    showAudioGenerationStartedToast: jest.fn(),
    showAudioGenerationCompleteToast: jest.fn(),
    showAudioGenerationErrorToast: jest.fn(),
  }
})

import {
  __resetForTests,
  enqueueAudioGenerationJob,
  getState,
} from './audioGenerationJobStore'
import { createAttachedAudioLink } from './linkRecording'
import {
  downloadAudioGenerationResult,
  pollAudioGenerationJob,
} from './musicGenerationClient'

describe('audioGenerationJobStore', function() {
  beforeEach(function() {
    pollAudioGenerationJob.mockResolvedValue({
      stage: 'complete',
      audioUrl: '/generate-audio/job-1/audio',
    })
    downloadAudioGenerationResult.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
    createAttachedAudioLink.mockResolvedValue({
      link: { title: 'Generated track', link: 'tunebook://recording/gen-1' },
    })
  })

  afterEach(function() {
    __resetForTests()
    jest.clearAllMocks()
  })

  test('appends generated audio links so existing links stay default', async function() {
    const existingLink = { title: 'Original', link: 'https://example.com/audio.mp3' }
    const onTuneChange = jest.fn()
    enqueueAudioGenerationJob({
      tuneId: 't1',
      tuneName: 'Test tune',
      resolverJobId: 'resolver-job-1',
      tune: { id: 't1', name: 'Test tune', links: [existingLink] },
      onTuneChange: onTuneChange,
    })

    await new Promise(function(resolve) {
      setTimeout(resolve, 50)
    })

    expect(onTuneChange).toHaveBeenCalledWith(expect.objectContaining({
      links: [
        existingLink,
        { title: 'Generated track', link: 'tunebook://recording/gen-1' },
      ],
    }))
  })

  test('getState returns a stable snapshot reference until the store changes', function() {
    const first = getState()
    const second = getState()
    expect(second).toBe(first)

    enqueueAudioGenerationJob({
      tuneId: 't1',
      tuneName: 'Test tune',
      resolverJobId: 'resolver-job-1',
    })

    const afterEnqueue = getState()
    expect(afterEnqueue).not.toBe(first)
    expect(afterEnqueue.jobs.length).toBe(1)
    expect(getState()).toBe(afterEnqueue)
  })
})
