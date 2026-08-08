import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Collapse, Modal, Spinner } from 'react-bootstrap'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadArtistMediaAlbums, dedupeMediaSearchCandidates } from '../artistDiscographyCatalog'
import {
  appendResolvedCandidate,
  insertResolvedCandidateNext,
  playResolvedCandidate,
  queueResolvedCandidates,
} from '../artistDiscographyQueue'
import { mediaSearchResultDisplayArtist, mediaSearchSourceLabel } from '../mediaLinkSearchDisplay'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'
import './ArtistDiscographyBrowseModal.css'

function resolveTunesMap(props) {
  if (props.tunebook && props.tunebook.tunes) return props.tunebook.tunes
  return props.tunes || {}
}

function buildPlaybackContext(props) {
  const tunesMap = resolveTunesMap(props)
  return {
    tunebook: props.tunebook,
    tunes: tunesMap,
    mediaController: props.mediaController,
    nowPlayingQueue: props.nowPlayingQueue,
    setNowPlayingQueue: props.setNowPlayingQueue,
    setCurrentTune: props.setCurrentTune,
    navigate: props.navigate,
    location: props.location,
    materializeOptions: {
      tunes: tunesMap,
      accessToken: props.accessToken || '',
      resolverAvailable: props.resolverAvailable,
      searchIndex: props.searchIndex,
      loadTuneTexts: props.loadTuneTexts,
      forceRefresh: props.forceRefresh,
    },
  }
}

function seedArtistName(seedCandidate) {
  if (!seedCandidate) return ''
  return mediaSearchResultDisplayArtist(seedCandidate) || String(seedCandidate.artist || '').trim()
}

function albumCandidates(album) {
  return dedupeMediaSearchCandidates(
    (album && Array.isArray(album.tracks) ? album.tracks : [])
      .map(function(track) { return track && track.candidate })
      .filter(Boolean)
  )
}

function allArtistCandidates(albums) {
  return dedupeMediaSearchCandidates(
    (Array.isArray(albums) ? albums : []).reduce(function(out, album) {
      return out.concat(albumCandidates(album))
    }, [])
  )
}

export default function ArtistDiscographyBrowseModal(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const seedCandidate = props.seedCandidate || null
  const artistName = seedArtistName(seedCandidate)
  const [busy, setBusy] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [albums, setAlbums] = useState([])
  const [resolvedArtistName, setResolvedArtistName] = useState('')
  const [expandedAlbums, setExpandedAlbums] = useState({})
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  const playbackContext = useMemo(function() {
    return buildPlaybackContext(Object.assign({}, props, { navigate: navigate, location: location }))
  }, [props, navigate, location])

  useEffect(function() {
    if (!props.show || !artistName) return undefined
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    setProgress('Loading media files…')
    setAlbums([])
    setExpandedAlbums({})
    setResolvedArtistName(artistName)
    loadArtistMediaAlbums(artistName, {
      signal: controller.signal,
      accessToken: props.accessToken,
    }).then(function(result) {
      if (controller.signal.aborted) return
      setAlbums(result.albums || [])
      setResolvedArtistName(result.artistName || artistName)
      setBusy(false)
      setProgress('')
    }).catch(function(err) {
      if (err && err.name === 'AbortError') return
      setError((err && err.message) || 'Could not load artist media')
      setBusy(false)
      setProgress('')
    })
    return function() {
      controller.abort()
    }
  }, [props.show, artistName, props.accessToken])

  const toggleAlbum = useCallback(function(albumKey) {
    setExpandedAlbums(function(prev) {
      const next = Object.assign({}, prev)
      next[albumKey] = !next[albumKey]
      return next
    })
  }, [])

  async function runQueueAction(action) {
    if (queueBusy) return
    setQueueBusy(true)
    setProgress('Preparing playlist…')
    try {
      await action()
    } finally {
      setQueueBusy(false)
      setProgress('')
    }
  }

  async function handleArtistPlay(event) {
    event.preventDefault()
    const candidates = allArtistCandidates(albums)
    if (!candidates.length) return
    await runQueueAction(function() {
      return queueResolvedCandidates(candidates, playbackContext, { mode: 'play', name: displayName + ' — artist' })
    })
  }

  async function handleArtistQueue(event, mode) {
    event.preventDefault()
    const candidates = allArtistCandidates(albums)
    if (!candidates.length) return
    await runQueueAction(function() {
      return queueResolvedCandidates(candidates, playbackContext, { mode: mode, name: displayName + ' — artist' })
    })
  }

  async function handleAlbumPlay(album, event) {
    event.preventDefault()
    const candidates = albumCandidates(album)
    if (!candidates.length) return
    await runQueueAction(function() {
      return queueResolvedCandidates(candidates, playbackContext, {
        mode: 'play',
        name: (album && album.title ? album.title : 'Album') + ' — ' + displayName,
      })
    })
  }

  async function handleAlbumQueue(album, mode, event) {
    event.preventDefault()
    const candidates = albumCandidates(album)
    if (!candidates.length) return
    await runQueueAction(function() {
      return queueResolvedCandidates(candidates, playbackContext, {
        mode: mode,
        name: (album && album.title ? album.title : 'Album') + ' — ' + displayName,
      })
    })
  }

  async function handleTrackPlay(candidate, event) {
    event.preventDefault()
    if (!candidate) return
    await runQueueAction(function() {
      return playResolvedCandidate(candidate, playbackContext)
    })
  }

  async function handleTrackQueue(candidate, mode, event) {
    event.preventDefault()
    if (!candidate) return
    await runQueueAction(function() {
      if (mode === 'next') {
        return insertResolvedCandidateNext(candidate, playbackContext)
      }
      return appendResolvedCandidate(candidate, playbackContext)
    })
  }

  const displayName = resolvedArtistName || artistName
  const totalTracks = albums.reduce(function(sum, album) {
    return sum + (album.tracks ? album.tracks.length : 0)
  }, 0)
  const interactionBusy = busy || queueBusy

  return (
    <Modal
      show={!!props.show}
      onHide={props.onHide}
      size="lg"
      scrollable
      className="artist-discography-browse-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>{displayName || 'Artist discography'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {interactionBusy ? (
          <div className="artist-discography-browse-modal__loading">
            <Spinner animation="border" size="sm" className="me-2" />
            <span>{progress || 'Loading…'}</span>
          </div>
        ) : null}
        {error ? <div className="text-danger mb-2">{error}</div> : null}
        {!interactionBusy && displayName ? (
          <div className="artist-discography-browse-modal__header d-flex align-items-center justify-content-between gap-2 mb-3">
            <div className="small text-muted">
              Your library
              {albums.length ? (' · ' + albums.length + ' album' + (albums.length === 1 ? '' : 's')) : ''}
              {totalTracks ? (' · ' + totalTracks + ' track' + (totalTracks === 1 ? '' : 's')) : ''}
            </div>
            <PlayWithQueueDropdown
              variant="compact"
              playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
              onPlay={handleArtistPlay}
              onAddToQueue={props.setNowPlayingQueue ? function(e) { handleArtistQueue(e, 'append') } : null}
              onPlayNext={props.setNowPlayingQueue ? function(e) { handleArtistQueue(e, 'next') } : null}
              showQueueMenu={!!props.setNowPlayingQueue}
              playLabel="Play artist"
              disabled={!totalTracks || interactionBusy}
            />
          </div>
        ) : null}
        {!interactionBusy && !albums.length && !error ? (
          <div className="text-muted">No media files found for this artist.</div>
        ) : null}
        <div className="artist-discography-browse-modal__albums">
          {albums.map(function(album) {
            const albumKey = album.albumKey
            const expanded = !!expandedAlbums[albumKey]
            const yearLabel = album.year ? ' (' + album.year + ')' : ''
            const trackCount = album.tracks ? album.tracks.length : 0
            return (
              <div key={albumKey} className="artist-discography-browse-modal__album">
                <div className="artist-discography-browse-modal__album-header d-flex align-items-center justify-content-between gap-2">
                  <button
                    type="button"
                    className="artist-discography-browse-modal__album-toggle btn btn-link p-0 text-start"
                    onClick={function() { toggleAlbum(albumKey) }}
                    aria-expanded={expanded}
                  >
                    <span className="fw-semibold">{album.title}</span>
                    <span className="text-muted">{yearLabel}</span>
                    {trackCount ? (
                      <Badge bg="secondary" className="ms-2">{trackCount}</Badge>
                    ) : null}
                  </button>
                  <PlayWithQueueDropdown
                    variant="compact"
                    playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
                    onPlay={function(e) { handleAlbumPlay(album, e) }}
                    onAddToQueue={props.setNowPlayingQueue
                      ? function(e) { handleAlbumQueue(album, 'append', e) }
                      : null}
                    onPlayNext={props.setNowPlayingQueue
                      ? function(e) { handleAlbumQueue(album, 'next', e) }
                      : null}
                    showQueueMenu={!!props.setNowPlayingQueue}
                    disabled={!trackCount || interactionBusy}
                  />
                </div>
                <Collapse in={expanded}>
                  <div className="artist-discography-browse-modal__tracks">
                    {(album.tracks || []).map(function(track, trackIndex) {
                      const candidate = track.candidate
                      const title = track.title || (candidate && candidate.title) || 'Track'
                      const sourceLabel = candidate ? mediaSearchSourceLabel(candidate.source) : ''
                      const seedTitle = seedCandidate && seedCandidate.title
                        ? String(seedCandidate.title)
                        : ''
                      const isSeed = seedTitle && title === seedTitle
                      return (
                        <div
                          key={albumKey + '-' + trackIndex}
                          className={'artist-discography-browse-modal__track' + (isSeed ? ' is-seed' : '')}
                        >
                          <div className="artist-discography-browse-modal__track-title">
                            <span className="artist-discography-browse-modal__track-number">
                              {(trackIndex + 1) + '.'}
                            </span>
                            <span>{title}</span>
                            {sourceLabel ? (
                              <Badge bg="light" text="dark" className="ms-2">{sourceLabel}</Badge>
                            ) : null}
                          </div>
                          <PlayWithQueueDropdown
                            variant="compact"
                            playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
                            onPlay={function(e) { handleTrackPlay(candidate, e) }}
                            onAddToQueue={props.setNowPlayingQueue && candidate
                              ? function(e) { handleTrackQueue(candidate, 'append', e) }
                              : null}
                            onPlayNext={props.setNowPlayingQueue && candidate
                              ? function(e) { handleTrackQueue(candidate, 'next', e) }
                              : null}
                            showQueueMenu={!!props.setNowPlayingQueue && !!candidate}
                            disabled={!candidate || interactionBusy}
                          />
                        </div>
                      )
                    })}
                  </div>
                </Collapse>
              </div>
            )
          })}
        </div>
      </Modal.Body>
    </Modal>
  )
}
