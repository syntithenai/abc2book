import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Form, Modal, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  albumTypeCategory,
  fetchArtistAlbumDiscography,
  fetchArtistAlbumTracks,
  filterAlbumsByTypeCategories,
} from '../artistAlbumDiscographyClient'
import {
  buildLibraryTitleArtistEntries,
  isTrackInLibrary,
} from '../artistDiscographyLibraryMatch'
import { formatBulkLine } from '../bulkListFormat'
import './ArtistDiscographyImportModal.css'

const TYPE_CHIPS = [
  { id: 'Album', label: 'Albums' },
  { id: 'EP', label: 'EPs' },
  { id: 'Single', label: 'Singles' },
  { id: 'Compilation', label: 'Compilations' },
  { id: 'Other', label: 'Other' },
]

const DEFAULT_TYPE_CATEGORIES = ['Album']
const FILTER_DEBOUNCE_MS = 250

function albumKeyOf(album) {
  return String(album && (album.releaseGroupId || album.title) || '')
}

function trackKeyOf(albumKey, trackIndex) {
  return albumKey + '::' + trackIndex
}

function normalizeFilterText(value) {
  return String(value || '').trim().toLowerCase()
}

function textMatches(haystack, needle) {
  if (!needle) return true
  return normalizeFilterText(haystack).indexOf(needle) >= 0
}

function dedupeBulkLines(lines) {
  const seen = {}
  const out = []
  ;(lines || []).forEach(function(line) {
    const text = String(line || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    out.push(text)
  })
  return out
}

function albumHasTrackMatch(titles, needle) {
  if (!needle || !Array.isArray(titles)) return false
  for (let i = 0; i < titles.length; i += 1) {
    if (textMatches(titles[i], needle)) return true
  }
  return false
}

function albumHasLibraryTrack(titles, artist, libraryEntries) {
  if (!Array.isArray(titles) || !Array.isArray(libraryEntries) || !libraryEntries.length) {
    return false
  }
  for (let i = 0; i < titles.length; i += 1) {
    if (isTrackInLibrary(titles[i], artist, libraryEntries)) return true
  }
  return false
}

export default function ArtistDiscographyImportModal(props) {
  const artistQuery = String(props.artist || '').trim()
  const tunes = props.tunes || {}
  const [busy, setBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [resolvedArtistName, setResolvedArtistName] = useState('')
  const [allAlbums, setAllAlbums] = useState([])
  const [typeCategories, setTypeCategories] = useState(DEFAULT_TYPE_CATEGORIES.slice())
  const [textFilter, setTextFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [expandedAlbums, setExpandedAlbums] = useState({})
  const [tracksByAlbum, setTracksByAlbum] = useState({})
  const [trackLoading, setTrackLoading] = useState({})
  const [trackErrors, setTrackErrors] = useState({})
  const [selectedAlbums, setSelectedAlbums] = useState({})
  const [selectedTracks, setSelectedTracks] = useState({})
  const [libraryOnly, setLibraryOnly] = useState(false)
  const [songSearchBusy, setSongSearchBusy] = useState(false)
  const [libraryScanBusy, setLibraryScanBusy] = useState(false)
  const abortRef = useRef(null)
  const trackAbortRef = useRef({})
  const tracksCacheRef = useRef({})
  const songSearchAbortRef = useRef(0)
  const libraryScanAbortRef = useRef(0)
  const mbBusyToastWaveRef = useRef(0)

  function toastMusicBrainzBusyOnce(err, waveId) {
    if (!err || err.code !== 'MUSICBRAINZ_BUSY') return
    if (mbBusyToastWaveRef.current === waveId) return
    mbBusyToastWaveRef.current = waveId
    toast.error(err.message || 'MusicBrainz is busy — wait a moment and try again.')
  }

  const libraryEntries = useMemo(function() {
    return buildLibraryTitleArtistEntries(tunes)
  }, [tunes])

  const typeFilteredAlbums = useMemo(function() {
    return filterAlbumsByTypeCategories(allAlbums, typeCategories)
  }, [allAlbums, typeCategories])

  // Immediate needle for album-title filtering; debounced needle drives song loading.
  const filterNeedle = normalizeFilterText(textFilter)
  const songSearchNeedle = normalizeFilterText(debouncedFilter)
  const displayName = resolvedArtistName || artistQuery

  useEffect(function() {
    const handle = setTimeout(function() {
      setDebouncedFilter(textFilter)
    }, FILTER_DEBOUNCE_MS)
    return function() {
      clearTimeout(handle)
    }
  }, [textFilter])

  useEffect(function() {
    if (!props.show || !artistQuery) return undefined
    if (abortRef.current) abortRef.current.abort()
    Object.keys(trackAbortRef.current).forEach(function(key) {
      if (trackAbortRef.current[key]) trackAbortRef.current[key].abort()
    })
    trackAbortRef.current = {}
    tracksCacheRef.current = {}
    songSearchAbortRef.current += 1
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    setProgress('Looking up artist…')
    setAllAlbums([])
    setExpandedAlbums({})
    setTracksByAlbum({})
    setTrackLoading({})
    setTrackErrors({})
    setSelectedAlbums({})
    setSelectedTracks({})
    setTextFilter('')
    setDebouncedFilter('')
    setLibraryOnly(false)
    setSongSearchBusy(false)
    setLibraryScanBusy(false)
    setTypeCategories(DEFAULT_TYPE_CATEGORIES.slice())
    setResolvedArtistName(artistQuery)
    libraryScanAbortRef.current += 1
    songSearchAbortRef.current += 1
    fetchArtistAlbumDiscography(artistQuery, {
      signal: controller.signal,
      onProgress: function(message) {
        setProgress(String(message || '').trim())
      },
    }).then(function(result) {
      if (controller.signal.aborted) {
        if (abortRef.current === controller) {
          setBusy(false)
          setProgress('')
        }
        return
      }
      setAllAlbums(result.albums || [])
      setResolvedArtistName(result.artistName || artistQuery)
      setBusy(false)
      setProgress('')
      if (!(result.albums || []).length) {
        setError('No albums found for this artist.')
      }
    }).catch(function(err) {
      if (controller.signal.aborted || (err && err.name === 'AbortError')) {
        if (abortRef.current === controller) {
          setBusy(false)
          setProgress('')
        }
        return
      }
      setError((err && err.message) || 'Could not load discography')
      setBusy(false)
      setProgress('')
    })
    return function() {
      controller.abort()
    }
  }, [props.show, artistQuery])

  const ensureAlbumTracks = useCallback(async function(album) {
    const albumKey = albumKeyOf(album)
    if (!albumKey) return []
    if (Array.isArray(tracksCacheRef.current[albumKey])) {
      return tracksCacheRef.current[albumKey]
    }
    if (trackAbortRef.current[albumKey]) {
      trackAbortRef.current[albumKey].abort()
    }
    const controller = new AbortController()
    trackAbortRef.current[albumKey] = controller
    setTrackLoading(function(prev) {
      return Object.assign({}, prev, { [albumKey]: true })
    })
    setTrackErrors(function(prev) {
      const next = Object.assign({}, prev)
      delete next[albumKey]
      return next
    })
    try {
      const result = await fetchArtistAlbumTracks(album, displayName, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return []
      const titles = (result.titles || []).map(function(title) {
        return String(title || '').trim()
      }).filter(Boolean)
      tracksCacheRef.current[albumKey] = titles
      setTracksByAlbum(function(prev) {
        return Object.assign({}, prev, { [albumKey]: titles })
      })
      return titles
    } catch (err) {
      if (err && err.name === 'AbortError') return []
      toastMusicBrainzBusyOnce(err, songSearchAbortRef.current)
      setTrackErrors(function(prev) {
        return Object.assign({}, prev, {
          [albumKey]: (err && err.message) || 'Could not load tracks',
        })
      })
      return []
    } finally {
      if (trackAbortRef.current[albumKey] === controller) {
        delete trackAbortRef.current[albumKey]
      }
      setTrackLoading(function(prev) {
        const next = Object.assign({}, prev)
        delete next[albumKey]
        return next
      })
    }
  }, [displayName])

  // After debounce, load tracks so song titles can match; expand song hits as found.
  useEffect(function() {
    if (!songSearchNeedle || busy || !typeFilteredAlbums.length) {
      setSongSearchBusy(false)
      return undefined
    }
    let cancelled = false
    const searchId = songSearchAbortRef.current + 1
    songSearchAbortRef.current = searchId

    async function runSongSearch() {
      setSongSearchBusy(true)
      try {
        for (let i = 0; i < typeFilteredAlbums.length; i += 1) {
          if (cancelled || songSearchAbortRef.current !== searchId) break
          const album = typeFilteredAlbums[i]
          const albumKey = albumKeyOf(album)
          let titles = tracksCacheRef.current[albumKey]
          if (!Array.isArray(titles)) {
            titles = await ensureAlbumTracks(album)
          }
          if (cancelled || songSearchAbortRef.current !== searchId) break
          if (albumHasTrackMatch(titles, songSearchNeedle)) {
            setExpandedAlbums(function(prev) {
              if (prev[albumKey]) return prev
              return Object.assign({}, prev, { [albumKey]: true })
            })
          }
        }
      } catch (err) {
        if (!(err && err.name === 'AbortError') && !cancelled) {
          toastMusicBrainzBusyOnce(err, searchId)
          if (err && err.message && err.code !== 'MUSICBRAINZ_BUSY') {
            toast.error(err.message)
          }
        }
      } finally {
        if (cancelled || songSearchAbortRef.current === searchId) {
          setSongSearchBusy(false)
        }
      }
    }

    runSongSearch().catch(function() {
      setSongSearchBusy(false)
    })
    return function() {
      cancelled = true
    }
  }, [songSearchNeedle, typeFilteredAlbums, busy, ensureAlbumTracks])

  // When "In library" is on, load tracks and keep albums with library matches.
  useEffect(function() {
    if (!libraryOnly || busy || !typeFilteredAlbums.length) {
      setLibraryScanBusy(false)
      return undefined
    }
    if (!libraryEntries.length) {
      setLibraryScanBusy(false)
      return undefined
    }
    let cancelled = false
    const scanId = libraryScanAbortRef.current + 1
    libraryScanAbortRef.current = scanId

    async function runLibraryScan() {
      setLibraryScanBusy(true)
      const expandUpdates = {}
      const artistLabel = displayName || artistQuery
      try {
        for (let i = 0; i < typeFilteredAlbums.length; i += 1) {
          if (cancelled || libraryScanAbortRef.current !== scanId) break
          const album = typeFilteredAlbums[i]
          const albumKey = albumKeyOf(album)
          let titles = tracksCacheRef.current[albumKey]
          if (!Array.isArray(titles)) {
            titles = await ensureAlbumTracks(album)
          }
          if (cancelled || libraryScanAbortRef.current !== scanId) break
          if (albumHasLibraryTrack(titles, artistLabel, libraryEntries)) {
            expandUpdates[albumKey] = true
          }
        }
        if (!cancelled && libraryScanAbortRef.current === scanId && Object.keys(expandUpdates).length) {
          setExpandedAlbums(function(prev) {
            return Object.assign({}, prev, expandUpdates)
          })
        }
      } catch (err) {
        if (!(err && err.name === 'AbortError') && !cancelled) {
          toastMusicBrainzBusyOnce(err, scanId)
          if (err && err.message && err.code !== 'MUSICBRAINZ_BUSY') {
            toast.error(err.message)
          }
        }
      } finally {
        if (cancelled || libraryScanAbortRef.current === scanId) {
          setLibraryScanBusy(false)
        }
      }
    }

    runLibraryScan().catch(function() {
      setLibraryScanBusy(false)
    })
    return function() {
      cancelled = true
    }
  }, [
    libraryOnly,
    typeFilteredAlbums,
    busy,
    ensureAlbumTracks,
    libraryEntries,
    displayName,
    artistQuery,
  ])

  const visibleAlbums = useMemo(function() {
    const artistLabel = displayName || artistQuery
    return typeFilteredAlbums.filter(function(album) {
      const albumKey = albumKeyOf(album)
      const titles = tracksByAlbum[albumKey] || tracksCacheRef.current[albumKey]
      if (filterNeedle) {
        const titleHit = textMatches(album.title, filterNeedle)
        const trackHit = albumHasTrackMatch(titles, filterNeedle)
        if (!titleHit && !trackHit) return false
      }
      if (libraryOnly) {
        if (!libraryEntries.length) return false
        if (!Array.isArray(titles)) return false
        if (!albumHasLibraryTrack(titles, artistLabel, libraryEntries)) return false
      }
      return true
    })
  }, [
    typeFilteredAlbums,
    filterNeedle,
    tracksByAlbum,
    libraryOnly,
    libraryEntries,
    displayName,
    artistQuery,
  ])

  const libraryAlbumCount = useMemo(function() {
    if (!libraryEntries.length) return 0
    const artistLabel = displayName || artistQuery
    let count = 0
    typeFilteredAlbums.forEach(function(album) {
      const albumKey = albumKeyOf(album)
      const titles = tracksByAlbum[albumKey] || tracksCacheRef.current[albumKey]
      if (albumHasLibraryTrack(titles, artistLabel, libraryEntries)) count += 1
    })
    return count
  }, [typeFilteredAlbums, tracksByAlbum, libraryEntries, displayName, artistQuery])

  function handleToggleExpand(album) {
    const albumKey = albumKeyOf(album)
    const opening = !expandedAlbums[albumKey]
    setExpandedAlbums(function(prev) {
      return Object.assign({}, prev, { [albumKey]: opening })
    })
    if (opening) {
      ensureAlbumTracks(album)
    }
  }

  function toggleTypeCategory(categoryId) {
    setTypeCategories(function(prev) {
      const has = prev.indexOf(categoryId) >= 0
      if (has) {
        if (prev.length === 1) return prev
        return prev.filter(function(id) { return id !== categoryId })
      }
      return prev.concat([categoryId])
    })
  }

  function toggleAlbumSelected(albumKey, checked) {
    setSelectedAlbums(function(prev) {
      const next = Object.assign({}, prev)
      if (checked) next[albumKey] = true
      else delete next[albumKey]
      return next
    })
  }

  function toggleTrackSelected(key, checked) {
    setSelectedTracks(function(prev) {
      const next = Object.assign({}, prev)
      if (checked) next[key] = true
      else delete next[key]
      return next
    })
  }

  function linesFromTitles(titles, artistLabel) {
    return (titles || []).map(function(title) {
      return formatBulkLine({ title: title, artist: artistLabel })
    }).filter(Boolean)
  }

  function finishImport(lines) {
    const deduped = dedupeBulkLines(lines)
    if (!deduped.length) return
    if (typeof props.onImportLines === 'function') {
      props.onImportLines(deduped)
    }
  }

  async function handleImportAlbum(album) {
    if (importBusy) return
    setImportBusy(true)
    setProgress('Loading tracks…')
    try {
      const titles = await ensureAlbumTracks(album)
      const artistLabel = displayName || artistQuery
      finishImport(linesFromTitles(titles, artistLabel))
    } finally {
      setImportBusy(false)
      setProgress('')
    }
  }

  async function handleImportSelected() {
    if (importBusy) return
    setImportBusy(true)
    setProgress('Preparing selection…')
    try {
      const artistLabel = displayName || artistQuery
      const lines = []
      const albumKeys = Object.keys(selectedAlbums)
      for (let i = 0; i < albumKeys.length; i += 1) {
        const albumKey = albumKeys[i]
        const album = visibleAlbums.find(function(item) {
          return albumKeyOf(item) === albumKey
        }) || typeFilteredAlbums.find(function(item) {
          return albumKeyOf(item) === albumKey
        })
        if (!album) continue
        setProgress('Loading ' + (album.title || 'album') + '…')
        const titles = await ensureAlbumTracks(album)
        lines.push.apply(lines, linesFromTitles(titles, artistLabel))
      }
      Object.keys(selectedTracks).forEach(function(key) {
        if (!selectedTracks[key]) return
        const parts = key.split('::')
        const albumKey = parts[0]
        const trackIndex = parseInt(parts[1], 10)
        const titles = tracksCacheRef.current[albumKey] || tracksByAlbum[albumKey] || []
        const title = titles[trackIndex]
        if (title) lines.push(formatBulkLine({ title: title, artist: artistLabel }))
      })
      finishImport(lines)
    } finally {
      setImportBusy(false)
      setProgress('')
    }
  }

  async function handleImportAllVisible() {
    if (importBusy || !visibleAlbums.length) return
    setImportBusy(true)
    const artistLabel = displayName || artistQuery
    const lines = []
    try {
      for (let i = 0; i < visibleAlbums.length; i += 1) {
        const album = visibleAlbums[i]
        setProgress(
          'Loading album ' + (i + 1) + ' of ' + visibleAlbums.length
            + ' — ' + (album.title || 'album')
        )
        const titles = await ensureAlbumTracks(album)
        lines.push.apply(lines, linesFromTitles(titles, artistLabel))
      }
      finishImport(lines)
    } finally {
      setImportBusy(false)
      setProgress('')
    }
  }

  const selectedCount = Object.keys(selectedAlbums).length + Object.keys(selectedTracks).length
  // Only hard-block UI close during import; initial load/search use non-blocking status.
  const hardBusy = importBusy
  const showLoadOverlay = busy || importBusy
  const controlsBusy = busy || importBusy

  const typeCounts = useMemo(function() {
    const counts = {}
    TYPE_CHIPS.forEach(function(chip) { counts[chip.id] = 0 })
    allAlbums.forEach(function(album) {
      const cat = albumTypeCategory(album)
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [allAlbums])

  return (
    <Modal
      show={!!props.show}
      onHide={hardBusy ? undefined : props.onHide}
      size="lg"
      scrollable
      className="artist-discography-import-modal"
      data-testid="artist-discography-import-modal"
    >
      <Modal.Header closeButton={!hardBusy}>
        <Modal.Title>{displayName || 'Artist discography'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {showLoadOverlay ? (
          <div className="artist-discography-import-modal__loading" data-testid="discography-import-progress">
            <Spinner animation="border" size="sm" className="me-2" />
            <span>{progress || 'Loading…'}</span>
          </div>
        ) : null}
        {error && !busy ? <div className="text-danger mb-2">{error}</div> : null}

        {!busy && allAlbums.length ? (
          <div className="artist-discography-import-modal__filters mb-3" data-testid="discography-type-filters">
            <Form.Control
              type="search"
              className="mb-2"
              placeholder="Filter albums or songs…"
              value={textFilter}
              disabled={hardBusy}
              data-testid="discography-text-filter"
              onChange={function(event) {
                setTextFilter(event.target.value)
              }}
            />
            <div className="small text-muted mb-2">
              MusicBrainz
              {' · '}
              {visibleAlbums.length} album{visibleAlbums.length === 1 ? '' : 's'}
              {visibleAlbums.length !== typeFilteredAlbums.length
                || typeFilteredAlbums.length !== allAlbums.length
                ? (' of ' + allAlbums.length)
                : ''}
              {songSearchBusy ? ' · Searching songs…' : ''}
              {libraryScanBusy ? ' · Finding library matches…' : ''}
            </div>
            <div className="d-flex flex-wrap gap-2">
              {TYPE_CHIPS.map(function(chip) {
                const count = typeCounts[chip.id] || 0
                if (!count && chip.id !== 'Album') return null
                const active = typeCategories.indexOf(chip.id) >= 0
                return (
                  <Button
                    key={chip.id}
                    size="sm"
                    variant={active ? 'primary' : 'outline-secondary'}
                    disabled={controlsBusy}
                    data-testid={'discography-type-' + chip.id.toLowerCase()}
                    onClick={function() { toggleTypeCategory(chip.id) }}
                  >
                    {chip.label}
                    <Badge bg={active ? 'light' : 'secondary'} text={active ? 'dark' : undefined} className="ms-1">
                      {count}
                    </Badge>
                  </Button>
                )
              })}
              <Button
                size="sm"
                variant={libraryOnly ? 'success' : 'outline-success'}
                disabled={controlsBusy}
                data-testid="discography-library-filter"
                title="Show only albums that have songs already in your library"
                onClick={function() { setLibraryOnly(function(prev) { return !prev }) }}
              >
                In library
                <Badge
                  bg={libraryOnly ? 'light' : 'secondary'}
                  text={libraryOnly ? 'dark' : undefined}
                  className="ms-1"
                >
                  {libraryScanBusy ? '…' : libraryAlbumCount}
                </Badge>
              </Button>
            </div>
          </div>
        ) : null}

        {!busy && filterNeedle && !visibleAlbums.length && !songSearchBusy && !libraryScanBusy ? (
          <div className="text-muted mb-2">No albums or songs match “{textFilter.trim()}”.</div>
        ) : null}
        {!busy && libraryOnly && !filterNeedle && !visibleAlbums.length && !libraryScanBusy ? (
          <div className="text-muted mb-2" data-testid="discography-library-empty">
            {libraryEntries.length
              ? 'No albums in this list have songs already in your library.'
              : 'No songs from this artist are in your library yet.'}
          </div>
        ) : null}

        <div className="artist-discography-import-modal__albums">
          {visibleAlbums.map(function(album) {
            const albumKey = albumKeyOf(album)
            const titles = tracksByAlbum[albumKey]
            const songMatch = !!(filterNeedle && albumHasTrackMatch(titles, filterNeedle))
            const libraryMatch = !!(
              libraryOnly
              && albumHasLibraryTrack(titles, displayName || artistQuery, libraryEntries)
            )
            // Auto-expand when the active filter hits songs on this album.
            const expanded = !!expandedAlbums[albumKey] || songMatch || libraryMatch
            const yearLabel = album.year ? ' (' + album.year + ')' : ''
            const typeLabel = albumTypeCategory(album)
            const loadingTracks = !!trackLoading[albumKey]
            const trackError = trackErrors[albumKey] || ''
            const albumChecked = !!selectedAlbums[albumKey]
            const albumTitleMatch = filterNeedle ? textMatches(album.title, filterNeedle) : false
            return (
              <div
                key={albumKey}
                className="artist-discography-import-modal__album"
                data-testid="discography-import-album"
              >
                <div className="artist-discography-import-modal__album-header d-flex align-items-start justify-content-between gap-2">
                  <div className="d-flex align-items-start gap-2 min-w-0 flex-grow-1">
                    <Form.Check
                      type="checkbox"
                      className="mt-1"
                      checked={albumChecked}
                      disabled={controlsBusy}
                      aria-label={'Select album ' + (album.title || '')}
                      data-testid="discography-import-album-check"
                      onChange={function(event) {
                        toggleAlbumSelected(albumKey, event.target.checked)
                      }}
                    />
                    <button
                      type="button"
                      className="artist-discography-import-modal__album-toggle btn btn-link p-0 text-start"
                      onClick={function() { handleToggleExpand(album) }}
                      aria-expanded={expanded}
                      disabled={importBusy}
                      data-testid="discography-import-album-toggle"
                    >
                      <span
                        className={
                          'artist-discography-import-modal__chevron'
                          + (expanded ? ' is-expanded' : '')
                        }
                        aria-hidden="true"
                      >
                        ▸
                      </span>
                      <span className={'fw-semibold' + (albumTitleMatch ? ' is-filter-match' : '')}>
                        {album.title}
                      </span>
                      <span className="text-muted">{yearLabel}</span>
                      <Badge bg="secondary" className="ms-2">{typeLabel}</Badge>
                      {Array.isArray(titles) ? (
                        <Badge bg="light" text="dark" className="ms-2">{titles.length}</Badge>
                      ) : null}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    disabled={controlsBusy}
                    data-testid="discography-import-album-btn"
                    onClick={function() { handleImportAlbum(album) }}
                  >
                    Import album
                  </Button>
                </div>
                {expanded ? (
                  <div
                    className="artist-discography-import-modal__tracks"
                    data-testid="discography-import-tracks"
                  >
                    {loadingTracks ? (
                      <div className="small text-muted py-1">
                        <Spinner animation="border" size="sm" className="me-2" />
                        Loading tracks…
                      </div>
                    ) : null}
                    {trackError ? (
                      <div className="small text-danger py-1">{trackError}</div>
                    ) : null}
                    {!loadingTracks && Array.isArray(titles) && !titles.length ? (
                      <div className="small text-muted py-1">No tracks found for this album.</div>
                    ) : null}
                    {(titles || []).map(function(title, trackIndex) {
                      const key = trackKeyOf(albumKey, trackIndex)
                      const inLibrary = isTrackInLibrary(title, displayName, libraryEntries)
                      const checked = !!selectedTracks[key] || albumChecked
                      const trackMatch = filterNeedle ? textMatches(title, filterNeedle) : false
                      if (filterNeedle && !albumTitleMatch && !trackMatch) {
                        return null
                      }
                      if (libraryOnly && !inLibrary) {
                        return null
                      }
                      return (
                        <div
                          key={key}
                          className={
                            'artist-discography-import-modal__track'
                            + (inLibrary ? ' is-in-library' : '')
                            + (trackMatch ? ' is-filter-match' : '')
                          }
                          data-testid="discography-import-track"
                        >
                          <Form.Check
                            type="checkbox"
                            checked={checked}
                            disabled={controlsBusy || albumChecked}
                            aria-label={'Select track ' + title}
                            data-testid="discography-import-track-check"
                            onChange={function(event) {
                              toggleTrackSelected(key, event.target.checked)
                            }}
                          />
                          <div className="artist-discography-import-modal__track-title">
                            <span className="artist-discography-import-modal__track-number">
                              {(trackIndex + 1) + '.'}
                            </span>
                            <span>{title}</span>
                            {inLibrary ? (
                              <Badge
                                bg="success"
                                className="ms-2"
                                data-testid="discography-in-library"
                              >
                                In library
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="outline-secondary"
          disabled={hardBusy}
          onClick={props.onHide}
        >
          Cancel
        </Button>
        <Button
          variant="outline-primary"
          disabled={controlsBusy || !visibleAlbums.length}
          data-testid="discography-import-all"
          onClick={handleImportAllVisible}
        >
          Import all albums
        </Button>
        <Button
          variant="primary"
          disabled={controlsBusy || !selectedCount}
          data-testid="discography-import-selected"
          onClick={handleImportSelected}
        >
          Import selected
          {selectedCount ? (' (' + selectedCount + ')') : ''}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
