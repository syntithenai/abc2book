jest.mock('./tuneListFilter', function() {
  return {
    yieldToMain: jest.fn(function() {
      return Promise.resolve()
    }),
  }
})

import { yieldToMain } from './tuneListFilter'
import {
  BULK_OPERATION_PROGRESS_THRESHOLD,
  buildBulkProgressEvent,
  runChunkedBulkOperation,
  runChunkedTunebookMutation,
  shouldShowBulkOperationProgress,
} from './bulkOperationProgress'

describe('bulkOperationProgress', function() {
  test('shouldShowBulkOperationProgress respects threshold', function() {
    expect(shouldShowBulkOperationProgress(BULK_OPERATION_PROGRESS_THRESHOLD - 1)).toBe(false)
    expect(shouldShowBulkOperationProgress(BULK_OPERATION_PROGRESS_THRESHOLD)).toBe(true)
    expect(shouldShowBulkOperationProgress(500)).toBe(true)
  })

  test('buildBulkProgressEvent computes percent and message', function() {
    expect(buildBulkProgressEvent(25, 100, 'Working')).toEqual({
      current: 25,
      total: 100,
      percent: 25,
      message: 'Working',
    })
    expect(buildBulkProgressEvent(0, 0, '')).toEqual({
      current: 0,
      total: 0,
      percent: 0,
      message: '',
    })
  })

  test('runChunkedBulkOperation processes chunks and reports progress', async function() {
    const items = Array.from({ length: 7 }, function(_, index) { return index + 1 })
    const chunkSizes = []
    const progressEvents = []

    const result = await runChunkedBulkOperation({
      items: items,
      chunkSize: 3,
      processChunk: function(chunk) {
        chunkSizes.push(chunk.length)
      },
      onProgress: function(event) {
        progressEvents.push(event)
      },
    })

    expect(result).toEqual({ processed: 7, cancelled: false })
    expect(chunkSizes).toEqual([3, 3, 1])
    expect(progressEvents.map(function(event) { return event.current })).toEqual([3, 6, 7])
    expect(progressEvents[progressEvents.length - 1].percent).toBe(100)
    expect(yieldToMain).toHaveBeenCalledTimes(2)
  })

  test('runChunkedBulkOperation supports cancellation', async function() {
    let chunksDone = 0
    const progressEvents = []

    const result = await runChunkedBulkOperation({
      items: [1, 2, 3, 4, 5],
      chunkSize: 1,
      processChunk: function() {
        chunksDone += 1
      },
      shouldCancel: function() {
        return chunksDone >= 2
      },
      onProgress: function(event) {
        progressEvents.push(event.current)
      },
    })

    expect(result.cancelled).toBe(true)
    expect(result.processed).toBe(2)
    expect(progressEvents).toEqual([1, 2])
  })

  test('runChunkedTunebookMutation batches commits around chunked work', async function() {
    const tunebook = {
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
    }
    const onComplete = jest.fn()

    const processedChunks = []

    await runChunkedTunebookMutation(tunebook, {
      items: ['a', 'b', 'c', 'd'],
      chunkSize: 2,
      processChunk: function(chunk) {
        processedChunks.push(chunk.slice())
      },
      onComplete: onComplete,
    })

    expect(processedChunks).toEqual([['a', 'b'], ['c', 'd']])

    expect(tunebook.beginTunesBatchCommit).toHaveBeenCalledTimes(1)
    expect(tunebook.commitTunesBatch).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith({ processed: 4, cancelled: false })
  })
})
