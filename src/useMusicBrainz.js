import { musicBrainzGet } from './musicBrainzRequest'

/**
 * Legacy MusicBrainz helpers used by artist typeaheads.
 * Always settle promises (never leave raw axios rejections unhandled).
 */
function useMusicBrainz() {
  let searchTimeout = null

  function worksByArtist(artistId) {
    const chunkSize = 100
    if (!artistId) return Promise.resolve([])

    return musicBrainzGet('/work', {
      params: {
        query: artistId,
        limit: chunkSize,
        fmt: 'json',
      },
    }).then(async function(results) {
      const works = results && results.data && Array.isArray(results.data.works)
        ? results.data.works
        : []
      const workCount = results && results.data ? results.data['work-count'] : 0
      if (!works.length || !(workCount > 0)) return []
      if (works.length >= workCount) return works

      const chunks = parseInt((workCount - 1) / chunkSize, 10)
      const pages = []
      for (let i = 1; i <= chunks; i += 1) {
        pages.push(
          new Promise(function(resolve, reject) {
            setTimeout(function() {
              musicBrainzGet('/work', {
                params: {
                  query: artistId,
                  limit: chunkSize,
                  fmt: 'json',
                  offset: i * chunkSize,
                },
              }).then(function(res) {
                resolve(res && res.data && Array.isArray(res.data.works) ? res.data.works : [])
              }).catch(reject)
            }, 1000 * i)
          })
        )
      }

      const resultsArray = await Promise.all(pages)
      const final = {}
      works.forEach(function(work) {
        if (work.title) final[work.title] = work
      })
      resultsArray.forEach(function(resultSet) {
        resultSet.forEach(function(result) {
          if (result.title) final[result.title] = result
        })
      })
      return Object.values(final)
    })
  }

  function searchArtist(query) {
    if (!query) return Promise.resolve([])
    clearTimeout(searchTimeout)
    return new Promise(function(resolve, reject) {
      searchTimeout = setTimeout(function() {
        musicBrainzGet('/artist', {
          params: { query: query, fmt: 'json' },
        }).then(function(results) {
          resolve(results && results.data && results.data.artists ? results.data.artists : [])
        }).catch(reject)
      }, 500)
    })
  }

  async function artistOptions(filter) {
    const artists = await searchArtist(filter)
    const final = []
    const seen = {}
    artists.forEach(function(a) {
      if (a.name && !Object.prototype.hasOwnProperty.call(seen, a.name)) {
        final.push({ value: a.id, label: a.name })
        seen[a.name] = true
      }
    })
    final.sort(function(a, b) {
      return (a && a.label && b && b.label && b.label > a.label) ? -1 : 1
    })
    return final
  }

  return { searchArtist, artistOptions, worksByArtist }
}

export default useMusicBrainz
