jest.mock('./scratchpadStore', function() {
  return {
    getScratchpadItem: jest.fn(),
  }
})

jest.mock('./scratchpadAnalyse', function() {
  return {
    runScratchpadAudioTranscribe: jest.fn(),
  }
})

import { getScratchpadItem } from './scratchpadStore'
import { runScratchpadAudioTranscribe } from './scratchpadAnalyse'
import {
  enqueueScratchpadTranscribeJob,
  cancelScratchpadBackgroundJob,
  clearInactiveScratchpadBackgroundJobs,
  getScratchpadBackgroundJobs,
  countScratchpadBackgroundIncomplete,
  __resetScratchpadBackgroundJobsForTests,
} from './scratchpadBackgroundJobs'

describe('scratchpadBackgroundJobs', function() {
  beforeEach(function() {
    jest.clearAllMocks()
    __resetScratchpadBackgroundJobsForTests()
  })

  test('enqueueScratchpadTranscribeJob queues and completes transcription', async function() {
    getScratchpadItem.mockReturnValue({
      id: 'aud-1',
      type: 'audio',
      title: 'Voice memo',
      audio: { tracks: [] },
    })
    runScratchpadAudioTranscribe.mockResolvedValue({ id: 'text-1' })

    const job = enqueueScratchpadTranscribeJob({
      item: { id: 'aud-1', type: 'audio', title: 'Voice memo' },
      workspaceId: 'ws-1',
      token: 'token',
    })

    expect(job.status).toBe('pending')
    expect(countScratchpadBackgroundIncomplete()).toBe(1)

    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    await new Promise(function(resolve) { setTimeout(resolve, 0) })

    const jobs = getScratchpadBackgroundJobs()
    expect(jobs.length).toBe(1)
    expect(jobs[0].status).toBe('done')
    expect(jobs[0].createdItemId).toBe('text-1')
    expect(runScratchpadAudioTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aud-1' }),
      expect.objectContaining({ workspaceId: 'ws-1' })
    )
    expect(countScratchpadBackgroundIncomplete()).toBe(0)
  })

  test('cancelScratchpadBackgroundJob cancels pending job', function() {
    getScratchpadItem.mockReturnValue({
      id: 'aud-2',
      type: 'audio',
      title: 'Memo',
      audio: { tracks: [] },
    })
    runScratchpadAudioTranscribe.mockReturnValue(new Promise(function() {}))

    const job = enqueueScratchpadTranscribeJob({
      item: { id: 'aud-2', type: 'audio', title: 'Memo' },
      workspaceId: 'ws-1',
    })

    cancelScratchpadBackgroundJob(job.id)
    expect(getScratchpadBackgroundJobs()[0].status).toBe('cancelled')
    expect(countScratchpadBackgroundIncomplete()).toBe(0)
  })

  test('clearInactiveScratchpadBackgroundJobs removes finished jobs', async function() {
    getScratchpadItem.mockReturnValue({
      id: 'aud-3',
      type: 'audio',
      title: 'Done memo',
      audio: { tracks: [] },
    })
    runScratchpadAudioTranscribe.mockResolvedValue({ id: 'text-3' })

    enqueueScratchpadTranscribeJob({
      item: { id: 'aud-3', type: 'audio', title: 'Done memo' },
      workspaceId: 'ws-1',
    })

    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    await new Promise(function(resolve) { setTimeout(resolve, 0) })

    expect(getScratchpadBackgroundJobs().length).toBe(1)
    clearInactiveScratchpadBackgroundJobs()
    expect(getScratchpadBackgroundJobs().length).toBe(0)
  })
})
