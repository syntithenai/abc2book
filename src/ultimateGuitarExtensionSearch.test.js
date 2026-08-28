import {
  buildUltimateGuitarSearchUrl,
  ultimateGuitarSearchCandidatesFromHtml,
} from './ultimateGuitarExtensionSearch'

describe('ultimateGuitarExtensionSearch', function() {
  test('buildUltimateGuitarSearchUrl encodes title and artist', function() {
    const url = buildUltimateGuitarSearchUrl('Under African Skies', 'Paul Simon')
    expect(url).toContain('ultimate-guitar.com/search.php')
    expect(url).toContain('type=300')
    expect(url).toContain(encodeURIComponent('Under African Skies Paul Simon'))
  })

  test('ultimateGuitarSearchCandidatesFromHtml ranks chords tabs', function() {
    const store = {
      store: {
        page: {
          data: {
            results: [
              {
                tab_url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-tabs-5200',
                type: 'Tabs',
                song_name: 'Wonderwall',
                artist_name: 'Oasis',
                votes: 9000,
                rating: 4.8,
              },
              {
                tab_url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-39144',
                type: 'Chords',
                song_name: 'Wonderwall',
                artist_name: 'Oasis',
                votes: 100,
                rating: 4.0,
              },
              {
                tab_url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596',
                type: 'Chords',
                song_name: 'Wonderwall',
                artist_name: 'Oasis',
                votes: 50000,
                rating: 4.9,
              },
            ],
          },
        },
      },
    }
    const encoded = encodeURIComponent(JSON.stringify(store))
      .replace(/'/g, '%27')
    // UG embeds HTML-escaped JSON in data-content.
    const dataContent = JSON.stringify(store)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
    const html = '<div class="js-store" data-content="' + dataContent + '"></div>'
    void encoded

    const candidates = ultimateGuitarSearchCandidatesFromHtml(html, 'Wonderwall', 'Oasis')
    expect(candidates.length).toBe(2)
    expect(candidates[0].url).toContain('wonderwall-chords-27596')
    expect(candidates[0].source).toBe('tabs.ultimate-guitar.com')
  })
})
