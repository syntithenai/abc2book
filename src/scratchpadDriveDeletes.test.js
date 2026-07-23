import {
  enqueueScratchpadDriveDeletes,
  flushScratchpadDriveDeletes,
  clearScratchpadDriveDeleteQueue,
} from './scratchpadDriveDeletes'

describe('scratchpadDriveDeletes', function() {
  let driveApi

  beforeEach(async function() {
    driveApi = {
      deleteDocument: jest.fn(async function(id) {
        if (id === 'missing-404') {
          return { error: { response: { status: 404 } } }
        }
        if (id === 'fail-500') {
          return { error: { response: { status: 500 } } }
        }
        return { ok: true }
      }),
    }
    await clearScratchpadDriveDeleteQueue()
  })

  test('enqueueScratchpadDriveDeletes dedupes ids', async function() {
    const list = await enqueueScratchpadDriveDeletes(['a', 'a', 'b'])
    expect(list).toEqual(['a', 'b'])
    const again = await enqueueScratchpadDriveDeletes(['b', 'c'])
    expect(again).toEqual(['a', 'b', 'c'])
    await clearScratchpadDriveDeleteQueue()
  })

  test('flushScratchpadDriveDeletes removes successful and 404 ids', async function() {
    const queued = await enqueueScratchpadDriveDeletes(['ok-1', 'missing-404', 'fail-500'])
    expect(queued).toEqual(['ok-1', 'missing-404', 'fail-500'])
    const result = await flushScratchpadDriveDeletes(driveApi, { accessToken: 'token' })
    expect(driveApi.deleteDocument).toHaveBeenCalledTimes(3)
    expect(result.remaining).toEqual(['fail-500'])
    expect(result.deleted).toBe(2)
  })
})
