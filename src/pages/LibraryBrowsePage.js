import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router-dom'
import FieldVoiceFillButton from '../components/FieldVoiceFillButton'
import LibraryNav, { LIBRARY_BROWSE_MODES } from '../components/LibraryNav'
import MusicCollectionFolderTree from '../components/MusicCollectionFolderTree'
import MusicCollectionMetadataShelf from '../components/MusicCollectionMetadataShelf'
import MusicCollectionTrackRow from '../components/MusicCollectionTrackRow'
import PlayWithQueueDropdown from '../components/PlayWithQueueDropdown'
import {
  formatMusicCollectionBrowseError,
  getMusicCollectionBrowseAccess,
  isMusicCollectionAuthorizationError,
  MUSIC_COLLECTION_AUTH_DENIED_MESSAGE,
} from '../musicCollectionBrowseAccess'
import { buildMusicCollectionCandidateFromEntry } from '../musicCollectionCandidateUtils'
import {
  browseMusicCollection,
  fetchMusicCollectionAlbums,
  fetchMusicCollectionArtists,
  fetchMusicCollectionGenres,
  fetchMusicCollectionTree,
} from '../musicCollectionCuratorClient'
import { ensureMediaSearchTune } from '../mediaSearchTuneMaterialize'
import { createQueue, appendTunesToQueue, insertTunesAfterCurrentInQueue } from '../nowPlayingQueue'
import { useDocumentTitle } from '../pageTitle'
import { normalizeAccessToken } from '../mediaProxyClient'
import { isMobilePlatform } from '../platformUtils'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { finalizePlayNextQueue } from '../tunePlaybackActions'

const TRACK_PAGE_SIZE = 50
const BULK_ADD_CAP = 50

function selectionLabel(selection) {
  if (!selection) return ''
  if (selection.mode === LIBRARY_BROWSE_MODES.folders) {
    return selection.pathPrefix ? selection.pathPrefix : 'All folders'
  }
  if (selection.mode === LIBRARY_BROWSE_MODES.artists) return selection.artist || ''
  if (selection.mode === LIBRARY_BROWSE_MODES.albums) return selection.album || ''
  if (selection.mode === LIBRARY_BROWSE_MODES.genres) return selection.genre || ''
  return ''
}

const VERIFY_IDLE = 'idle'
const VERIFY_PENDING = 'pending'
const VERIFY_OK = 'ok'
const VERIFY_DENIED = 'denied'

export default function LibraryBrowsePage(props) {
  useDocumentTitle('Library')
  const navigate = useNavigate()
  const token = props.token
  const tunebook = props.tunebook
  const login = props.login
  const { status, checked } = useMediaResolverHealth()
  const [verifyState, setVerifyState] = useState(VERIFY_IDLE)
  const [browseVerified, setBrowseVerified] = useState(false)
  const browseAccess = getMusicCollectionBrowseAccess({
    resolverStatus: status,
    accessToken: token,
    browseVerified: browseVerified,
  })
  const resolverBase = browseAccess.resolverBase || ''
  const hasToken = !!normalizeAccessToken(token)
  const canShowBrowse = browseAccess.canBrowse

  const [mode, setMode] = useState(LIBRARY_BROWSE_MODES.folders)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState(null)
  const [tracks, setTracks] = useState([])
  const [tracksTotal, setTracksTotal] = useState(0)
  const [tracksOffset, setTracksOffset] = useState(0)
  const [tracksBusy, setTracksBusy] = useState(false)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState({
    folders: null,
    artists: null,
    albums: null,
    genres: null,
  })
  const [rootTreeBody, setRootTreeBody] = useState(null)
  const sectionSearchRef = useRef(null)

  useEffect(function() {
    if (isMobilePlatform()) return
    var input = sectionSearchRef.current
    if (input && typeof input.focus === 'function') input.focus()
  }, [])

  useEffect(function() {
    const accessToken = normalizeAccessToken(token)
    if (!accessToken) {
      setVerifyState(VERIFY_IDLE)
      setBrowseVerified(false)
      return
    }
    if (!checked) return

    let cancelled = false
    setVerifyState(VERIFY_PENDING)
    setBrowseVerified(false)
    setError('')

    fetchMusicCollectionTree({ prefix: '', query: '', accessToken: token }).then(function(treeBody) {
      if (cancelled) return
      setRootTreeBody(treeBody || null)
      setBrowseVerified(true)
      setVerifyState(VERIFY_OK)
      setCounts({
        folders: (treeBody.folders || []).length,
        artists: null,
        albums: null,
        genres: null,
      })
    }).catch(function(e) {
      if (cancelled) return
      if (isMusicCollectionAuthorizationError(e)) {
        setVerifyState(VERIFY_DENIED)
      } else {
        setVerifyState(VERIFY_IDLE)
        setError(formatMusicCollectionBrowseError(e))
      }
    })

    return function() {
      cancelled = true
    }
  }, [token, checked])

  useEffect(function() {
    setSelection(null)
    setTracks([])
    setTracksTotal(0)
    setTracksOffset(0)
    setError('')
  }, [mode, query])

  const loadTracks = useCallback(async function(nextSelection, offset) {
    if (!nextSelection) {
      setTracks([])
      setTracksTotal(0)
      return
    }
    setTracksBusy(true)
    setError('')
    try {
      const browseOpts = {
        query: query,
        limit: TRACK_PAGE_SIZE,
        offset: offset || 0,
        accessToken: token,
      }
      if (nextSelection.mode === LIBRARY_BROWSE_MODES.folders) {
        browseOpts.pathPrefix = nextSelection.pathPrefix || ''
      } else if (nextSelection.mode === LIBRARY_BROWSE_MODES.artists) {
        browseOpts.artist = nextSelection.artist || ''
      } else if (nextSelection.mode === LIBRARY_BROWSE_MODES.albums) {
        browseOpts.album = nextSelection.album || ''
      } else if (nextSelection.mode === LIBRARY_BROWSE_MODES.genres) {
        browseOpts.genre = nextSelection.genre || ''
      }
      const body = await browseMusicCollection(browseOpts)
      if (offset && offset > 0) {
        setTracks(function(prev) { return prev.concat(body.entries || []) })
      } else {
        setTracks(body.entries || [])
      }
      setTracksTotal(typeof body.total === 'number' ? body.total : (body.entries || []).length)
      setTracksOffset(offset || 0)
    } catch (e) {
      setError(formatMusicCollectionBrowseError(e))
      setTracks([])
      setTracksTotal(0)
    } finally {
      setTracksBusy(false)
    }
  }, [query, token])

  useEffect(function() {
    if (!canShowBrowse) return
    loadTracks(selection, 0)
  }, [selection, loadTracks, canShowBrowse])

  function handleShelfLoaded(sectionKey, total) {
    setCounts(function(prev) {
      if (prev[sectionKey] === total) return prev
      return Object.assign({}, prev, { [sectionKey]: total })
    })
  }

  function selectFolder(pathPrefix) {
    setSelection({
      mode: LIBRARY_BROWSE_MODES.folders,
      pathPrefix: pathPrefix || '',
    })
  }

  function selectArtist(artist) {
    setSelection({
      mode: LIBRARY_BROWSE_MODES.artists,
      artist: artist,
    })
  }

  function selectAlbum(album) {
    setSelection({
      mode: LIBRARY_BROWSE_MODES.albums,
      album: album,
    })
  }

  function selectGenre(genre) {
    setSelection({
      mode: LIBRARY_BROWSE_MODES.genres,
      genre: genre,
    })
  }

  async function materializeTrackSlice() {
    const candidates = tracks.slice(0, BULK_ADD_CAP).map(function(entry) {
      return buildMusicCollectionCandidateFromEntry(entry, resolverBase)
    }).filter(Boolean)
    if (!candidates.length || !props.tunebook) return []
    const materialized = await Promise.all(candidates.map(function(candidate) {
      return ensureMediaSearchTune(candidate, props.tunebook, {
        tunes: props.tunes,
        accessToken: token,
        forceRefresh: props.forceRefresh,
      })
    }))
    return materialized.filter(Boolean)
  }

  async function handlePlayAll(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.tunebook || !props.mediaController) return
    try {
      const materialized = await materializeTrackSlice()
      const tuneIds = materialized.map(function(tune) { return tune.id }).filter(Boolean)
      if (!tuneIds.length) return
      const queue = createQueue({
        tuneIds: tuneIds,
        name: selectionLabel(selection) || 'Library tracks',
        source: 'manual',
      })
      props.tunebook.startNowPlayingQueue(queue, navigate, {
        startPlayback: true,
        mediaController: props.mediaController,
      })
    } catch (err) {
      setError(formatMusicCollectionBrowseError(err))
    }
  }

  async function handleAddAllToQueue(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue) return
    try {
      const materialized = await materializeTrackSlice()
      const tuneIds = materialized.map(function(tune) { return tune.id }).filter(Boolean)
      if (!tuneIds.length) return
      props.setNowPlayingQueue(appendTunesToQueue(props.nowPlayingQueue, tuneIds))
    } catch (err) {
      setError(formatMusicCollectionBrowseError(err))
    }
  }

  async function handlePlayAllNext(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue) return
    try {
      const materialized = await materializeTrackSlice()
      const tuneIds = materialized.map(function(tune) { return tune.id }).filter(Boolean)
      if (!tuneIds.length) return
      const priorQueue = props.nowPlayingQueue
      const next = insertTunesAfterCurrentInQueue(priorQueue, tuneIds)
      finalizePlayNextQueue(props.mediaController, props.tunebook, priorQueue, next, props.setNowPlayingQueue)
    } catch (err) {
      setError(formatMusicCollectionBrowseError(err))
    }
  }

  function handleLoginClick() {
    if (typeof login !== 'function') return
    login().catch(function() {})
  }

  const selectedPath = selection && selection.mode === LIBRARY_BROWSE_MODES.folders
    ? (selection.pathPrefix || '')
    : ''
  const selectedShelfValue = selection && selection.mode !== LIBRARY_BROWSE_MODES.folders
    ? selectionLabel(selection)
    : ''
  const canLoadMore = tracks.length < tracksTotal

  return (
    <div className="library-page">
      <div className="library-page-header">
        <h1 className="library-page-title">Library</h1>
        <Button as={Link} to="/books" variant="outline-secondary" size="sm">
          Back to books
        </Button>
      </div>

      {!checked ? (
        <Alert variant="info">Connecting to media resolver…</Alert>
      ) : hasToken && verifyState === VERIFY_PENDING ? (
        <Alert variant="info">Checking library access…</Alert>
      ) : browseAccess.needsLogin ? (
        <Alert variant="warning" className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span>Sign in with Google to browse your home music collection.</span>
          {typeof login === 'function' ? (
            <Button variant="primary" size="sm" onClick={handleLoginClick}>
              Sign in
            </Button>
          ) : (
            <Button as={Link} to="/settings" variant="primary" size="sm">
              Open Settings
            </Button>
          )}
        </Alert>
      ) : verifyState === VERIFY_DENIED ? (
        <Alert variant="warning">{MUSIC_COLLECTION_AUTH_DENIED_MESSAGE}</Alert>
      ) : browseAccess.blockedMessage ? (
        <Alert variant="warning">{browseAccess.blockedMessage}</Alert>
      ) : null}

      {canShowBrowse ? (
        <>
          <LibraryNav
            tunebook={tunebook}
            activeMode={mode}
            onModeChange={setMode}
            folderCount={counts.folders}
            artistCount={counts.artists}
            albumCount={counts.albums}
            genreCount={counts.genres}
          />

          <Form className="library-page-search mb-3" onSubmit={function(e) { e.preventDefault() }}>
            <InputGroup>
              <Form.Control
                ref={sectionSearchRef}
                type="search"
                placeholder="Search library…"
                value={query}
                onChange={function(e) { setQuery(e.target.value) }}
                aria-label="Search library"
              />
              {query ? (
                <Button variant="outline-secondary" onClick={function() { setQuery('') }}>
                  Clear
                </Button>
              ) : null}
              <FieldVoiceFillButton
                fieldLabel="library search"
                onResult={function(text) { setQuery(String(text || '').trim()) }}
              />
            </InputGroup>
          </Form>

          {error ? <Alert variant="danger" onClose={function() { setError('') }} dismissible>{error}</Alert> : null}

          <div className="library-page-layout">
            <div className="library-page-browse-panel">
              {mode === LIBRARY_BROWSE_MODES.folders ? (
                <MusicCollectionFolderTree
                  query={query}
                  token={token}
                  rootData={rootTreeBody}
                  selectedPath={selectedPath}
                  onSelectFolder={selectFolder}
                />
              ) : null}
              {mode === LIBRARY_BROWSE_MODES.artists ? (
                <MusicCollectionMetadataShelf
                  labelKey="artist"
                  rowsKey="artists"
                  itemLabel="artists"
                  query={query}
                  token={token}
                  selectedValue={selectedShelfValue}
                  fetchRows={fetchMusicCollectionArtists}
                  onLoadTotal={function(total) { handleShelfLoaded('artists', total) }}
                  onSelect={selectArtist}
                />
              ) : null}
              {mode === LIBRARY_BROWSE_MODES.albums ? (
                <MusicCollectionMetadataShelf
                  labelKey="album"
                  rowsKey="albums"
                  itemLabel="albums"
                  query={query}
                  token={token}
                  selectedValue={selectedShelfValue}
                  fetchRows={fetchMusicCollectionAlbums}
                  onLoadTotal={function(total) { handleShelfLoaded('albums', total) }}
                  onSelect={selectAlbum}
                />
              ) : null}
              {mode === LIBRARY_BROWSE_MODES.genres ? (
                <MusicCollectionMetadataShelf
                  labelKey="genre"
                  rowsKey="genres"
                  itemLabel="genres"
                  query={query}
                  token={token}
                  selectedValue={selectedShelfValue}
                  fetchRows={fetchMusicCollectionGenres}
                  onLoadTotal={function(total) { handleShelfLoaded('genres', total) }}
                  onSelect={selectGenre}
                />
              ) : null}
            </div>

            <div className="library-page-tracks-panel">
              {selection ? (
                <>
                  <div className="library-page-tracks-header">
                    <h2 className="library-page-tracks-title h5 mb-0">{selectionLabel(selection)}</h2>
                    <div className="d-flex flex-wrap gap-2 align-items-center">
                      <span className="small text-muted">{tracksTotal} tracks</span>
                      {tracks.length ? (
                        <PlayWithQueueDropdown
                          variant="compact"
                          playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
                          playVariant="success"
                          onPlay={handlePlayAll}
                          onAddToQueue={props.setNowPlayingQueue ? handleAddAllToQueue : null}
                          onPlayNext={props.setNowPlayingQueue ? handlePlayAllNext : null}
                          playLabel={' Play all'}
                          addToQueueLabel={'Add all shown to queue'}
                          playNextLabel={'Play all shown next'}
                        />
                      ) : null}
                    </div>
                  </div>
                  {tracksBusy && !tracks.length ? <Spinner animation="border" size="sm" /> : null}
                  <div className="library-track-list">
                    {tracks.map(function(entry) {
                      return (
                        <MusicCollectionTrackRow
                          key={entry.id || entry.path}
                          entry={entry}
                          token={token}
                          resolverBase={resolverBase}
                          tunebook={props.tunebook}
                          tunes={props.tunes}
                          mediaController={props.mediaController}
                          nowPlayingQueue={props.nowPlayingQueue}
                          setNowPlayingQueue={props.setNowPlayingQueue}
                          nowPlayingTuneId={props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null}
                          forceRefresh={props.forceRefresh}
                          onError={function(err) { setError(formatMusicCollectionBrowseError(err)) }}
                        />
                      )
                    })}
                  </div>
                  {!tracksBusy && selection && !tracks.length ? (
                    <div className="small text-muted">No tracks in this selection.</div>
                  ) : null}
                  {canLoadMore ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0 mt-2"
                      disabled={tracksBusy}
                      onClick={function() { loadTracks(selection, tracks.length) }}
                    >
                      Load more
                    </Button>
                  ) : null}
                </>
              ) : (
                <div className="library-page-tracks-empty text-muted">
                  Select a folder, artist, album, or genre to list tracks.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
