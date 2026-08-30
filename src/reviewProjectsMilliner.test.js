/**
 * Milliner review-set loader (package → bookImportReviewStore).
 */
import {
  ensureMillinerReviewSet,
} from './reviewProjectsMilliner'
import {
  __resetBookImportReviewStoreForTests,
  getReviewSet,
} from './bookImportReviewStore'

jest.mock('./reviewProjectsClient', function() {
  return {
    fetchReviewProjectsJson: jest.fn(),
  }
})

const { fetchReviewProjectsJson } = require('./reviewProjectsClient')

describe('ensureMillinerReviewSet', function() {
  beforeEach(async function() {
    await __resetBookImportReviewStoreForTests()
    fetchReviewProjectsJson.mockReset()
  })

  test('creates review set with cropRemotePath from catalog', async function() {
    fetchReviewProjectsJson.mockResolvedValue({
      book: 'milliner koken',
      bookLabel: 'Milliner Koken',
      version: 1,
      tunes: [
        {
          id: 'abc123',
          title: 'Dusty Miller',
          page: 2,
          tuneIndex: 1,
          crop: 'c0_p02_01.jpg',
          complete: false,
          abc: 'X:1\nT:Dusty Miller\nM:4/4\nK:G\nG',
        },
      ],
    })
    const set = await ensureMillinerReviewSet({
      id: 'milliner-koken',
      packagePath: 'milliner-koken/merged/milliner-koken-import.json',
      cropsDir: 'milliner-koken/merged/tunes',
    }, 'token')
    expect(fetchReviewProjectsJson).toHaveBeenCalled()
    expect(set.book).toBe('milliner koken')
    expect(set.tunes).toHaveLength(1)
    expect(set.tunes[0].cropRemotePath).toBe('milliner-koken/merged/tunes/c0_p02_01.jpg')
    expect(set.tunes[0].cropName).toBe('c0_p02_01.jpg')
    const again = await ensureMillinerReviewSet({
      packagePath: 'x',
      cropsDir: 'y',
    }, 'token')
    expect(again.id).toBe(set.id)
    expect(fetchReviewProjectsJson).toHaveBeenCalledTimes(1)
    const stored = await getReviewSet(set.id)
    expect(stored.tunes[0].title).toBe('Dusty Miller')
  })
})
