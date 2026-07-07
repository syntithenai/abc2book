import { mergeLinksPreferLive, syncTuneFromStore } from './bulkCheckTuneSync'

describe('bulkCheckTuneSync', function() {
  test('mergeLinksPreferLive keeps playback boundaries from live tune', function() {
    const merged = mergeLinksPreferLive(
      [{ link: 'https://youtu.be/abc', title: 'Original' }],
      [{ link: 'https://youtu.be/abc', title: 'Original', startAt: '12', endAt: '180' }]
    )
    expect(merged[0].startAt).toBe('12')
    expect(merged[0].endAt).toBe('180')
  })

  test('syncTuneFromStore merges live links into in-memory draft', function() {
    const synced = syncTuneFromStore(
      {
        id: 't1',
        name: 'Draft title',
        links: [{ link: 'https://youtu.be/abc' }],
        key: 'G',
      },
      {
        tunes: {
          t1: {
            id: 't1',
            name: 'Saved title',
            links: [{ link: 'https://youtu.be/abc', startAt: '5', endAt: '90' }],
            key: 'D',
          },
        },
      }
    )
    expect(synced.name).toBe('Draft title')
    expect(synced.key).toBe('G')
    expect(synced.links[0].startAt).toBe('5')
    expect(synced.links[0].endAt).toBe('90')
  })

  test('syncTuneFromStore reads live tune from tunebook', function() {
    const synced = syncTuneFromStore(
      {
        id: 't1',
        links: [{ link: 'https://youtu.be/abc' }],
      },
      {
        tunebook: {
          fromSelection: function(selection) {
            if (!selection.t1) return []
            return [{
              id: 't1',
              links: [{ link: 'https://youtu.be/abc', startAt: '8', endAt: '120' }],
              key: 'Am',
            }]
          },
        },
      }
    )
    expect(synced.links[0].startAt).toBe('8')
    expect(synced.key).toBe('Am')
  })
})
