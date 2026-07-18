jest.mock('./bulkTextPrepare', function() {
  return {
    prepareBulkTextQueue: jest.fn(),
  }
})

import { prepareBulkTextIntoTextarea } from './bulkTextPrepareFill'
import { prepareBulkTextQueue } from './bulkTextPrepare'

describe('bulkTextPrepareFill', function() {
  beforeEach(function() {
    prepareBulkTextQueue.mockReset()
    prepareBulkTextQueue.mockResolvedValue([
      {
        tune: {
          name: 'Song',
          composer: 'Artist',
          links: [{ link: 'https://www.youtube.com/watch?v=abc123' }],
        },
        youtubeAutoselected: true,
      },
      {
        tune: { name: 'Other', composer: '', links: [] },
        youtubeAutoselected: false,
      },
    ])
  })

  test('rewrites textarea with high-confidence YouTube links', async function() {
    const result = await prepareBulkTextIntoTextarea('Song by Artist\nOther', {
      searchYouTube: true,
    })
    expect(result.filled).toBe(1)
    expect(result.text).toContain('https://www.youtube.com/watch?v=abc123')
    expect(result.text.split('\n')).toHaveLength(2)
  })
})
