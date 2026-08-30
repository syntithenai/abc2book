/**
 * Old Time enrich → bookImportReviewStore mapping.
 */
import { ensureOldtimeReviewSet } from './reviewProjectsOldtime'
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

describe('ensureOldtimeReviewSet', function() {
  beforeEach(async function() {
    await __resetBookImportReviewStoreForTests()
    fetchReviewProjectsJson.mockReset()
  })

  test('maps enrich package into book-import tunes with MIDI/PDF paths', async function() {
    fetchReviewProjectsJson.mockResolvedValue({
      kind: 'oldtimefiddletunes-enrich',
      proof: true,
      tunes: [
        {
          id: 'oldtime-demo',
          slug: 'demo',
          title: 'Demo Reel',
          midiUrl: 'https://example.com/demo.mid',
          pdfUrl: 'https://example.com/demo.pdf',
          localMidiPath: 'media/demo.mid',
          localPdfPath: 'media/demo.pdf',
          convertPrefer: 'midi',
          candidates: [],
          abc: '',
        },
      ],
    })
    const set = await ensureOldtimeReviewSet({
      id: 'oldtimefiddletunes',
      proofPackagePath: 'oldtimefiddletunes/public-packages/enrich_package_proof.json',
    }, 'token')
    expect(set.book).toBe('old time')
    expect(set.documentsProjectId).toBe('oldtimefiddletunes')
    expect(set.defaultStatusFilter).toBe('incomplete')
    expect(set.tunes).toHaveLength(1)
    expect(set.tunes[0].midiUrl).toContain('demo.mid')
    expect(set.tunes[0].midiRemotePath).toBe('oldtimefiddletunes/data/media/demo.mid')
    expect(set.tunes[0].pdfRemotePath).toBe('oldtimefiddletunes/data/media/demo.pdf')
    const again = await ensureOldtimeReviewSet({
      proofPackagePath: 'x',
    }, 'token')
    expect(again.id).toBe(set.id)
    expect(fetchReviewProjectsJson).toHaveBeenCalledTimes(1)
    const stored = await getReviewSet(set.id)
    expect(stored.tunes[0].title).toBe('Demo Reel')
  })
})
