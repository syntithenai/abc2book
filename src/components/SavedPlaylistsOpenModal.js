import { useEffect, useMemo, useState } from 'react'
import { Button, Form, ListGroup, Modal } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { createQueue } from '../nowPlayingQueue'
import ShareTunebookModal from './ShareTunebookModal'
import {
  listSavedPlaylists,
  getSavedPlaylist,
  deleteSavedPlaylist,
  queueFromSavedPlaylist,
  savePlaylistFromQueue,
} from '../savedPlaylistsStore'

function defaultSearchPlaylistName(filter, book, tags, genres, artists) {
  const parts = []
  if (book) parts.push(book)
  if (Array.isArray(tags) && tags.length) parts.push(tags.join(', '))
  if (Array.isArray(genres) && genres.length) parts.push(genres.join(', '))
  if (Array.isArray(artists) && artists.length) parts.push(artists.join(', '))
  if (filter && String(filter).trim()) parts.push(String(filter).trim())
  return parts.length ? parts.join(' · ') : 'Playlist'
}

export default function SavedPlaylistsOpenModal({
  show,
  onHide,
  tunebook,
  tunes,
  setNowPlayingQueue,
  onOpened,
  title,
  showSaveCurrentSearch,
  filter,
  currentTuneBook,
  tagFilter,
  genreFilter,
  artistFilter,
  token,
  login,
  googleDocumentId,
}) {
  const navigate = useNavigate()
  const [playlists, setPlaylists] = useState([])
  const [search, setSearch] = useState('')

  useEffect(function() {
    if (show) {
      setPlaylists(listSavedPlaylists())
      setSearch('')
    }
  }, [show])

  function refresh() {
    setPlaylists(listSavedPlaylists())
  }

  const filteredPlaylists = useMemo(function() {
    const q = String(search || '').trim().toLowerCase()
    if (!q) return playlists
    return playlists.filter(function(playlist) {
      return String(playlist.name || '').toLowerCase().indexOf(q) !== -1
    })
  }, [playlists, search])

  function handleOpen(id) {
    const saved = getSavedPlaylist(id)
    if (!saved) {
      refresh()
      return
    }
    const queue = queueFromSavedPlaylist(saved, tunes || {})
    if (!queue) {
      window.alert('None of the tunes in this playlist are in your tunebook.')
      return
    }
    if (tunebook.startNowPlayingQueue) {
      tunebook.startNowPlayingQueue(queue, navigate)
    } else if (setNowPlayingQueue) {
      setNowPlayingQueue(queue)
    }
    if (onOpened) onOpened(queue)
    if (onHide) onHide()
  }

  function handleDelete(id, event) {
    if (event) event.stopPropagation()
    const saved = getSavedPlaylist(id)
    const label = saved && saved.name ? saved.name : 'this playlist'
    if (!window.confirm('Delete saved playlist "' + label + '"?')) return
    deleteSavedPlaylist(id)
    refresh()
  }

  function handleSaveCurrentSearch() {
    if (!tunebook || !tunebook.fromSearch) return
    const matching = tunebook.fromSearch(
      filter || '',
      currentTuneBook,
      tagFilter,
      genreFilter,
      artistFilter
    )
    const tuneIds = (matching || []).map(function(tune) {
      return tune && tune.id
    }).filter(Boolean)
    if (!tuneIds.length) {
      window.alert('No tunes match the current search.')
      return
    }
    const defaultName = defaultSearchPlaylistName(
      filter,
      currentTuneBook,
      tagFilter,
      genreFilter,
      artistFilter
    )
    const name = window.prompt(
      'Save current search as playlist (' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') + '):',
      defaultName
    )
    if (name === null) return
    const queue = createQueue({
      tuneIds: tuneIds,
      name: String(name).trim() || defaultName,
      source: 'filter',
    })
    const saved = savePlaylistFromQueue(queue, { name: queue.name })
    if (!saved) {
      window.alert('Could not save playlist.')
      return
    }
    refresh()
  }

  const icons = tunebook && tunebook.icons ? tunebook.icons : {}

  return (
    <Modal
      show={show}
      onHide={onHide}
      onClick={function(e) { e.stopPropagation() }}
      size="md"
    >
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Playlists'}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {showSaveCurrentSearch ? (
          <div className="mb-3">
            <Button
              variant="success"
              className="w-100"
              data-testid="save-current-search-playlist"
              onClick={handleSaveCurrentSearch}
            >
              {icons.save} Save current search as playlist
            </Button>
          </div>
        ) : null}

        <Form.Control
          type="search"
          className="mb-3"
          placeholder="Search playlists"
          value={search}
          onChange={function(e) { setSearch(e.target.value) }}
          data-testid="playlist-manager-search"
          aria-label="Search playlists"
        />

        {playlists.length === 0 ? (
          <p className="text-muted mb-0">No saved playlists yet.</p>
        ) : filteredPlaylists.length === 0 ? (
          <p className="text-muted mb-0">No playlists match your search.</p>
        ) : (
          <ListGroup>
            {filteredPlaylists.map(function(playlist) {
              const count = playlist.items ? playlist.items.length : 0
              return (
                <ListGroup.Item
                  key={playlist.id}
                  className="d-flex align-items-center justify-content-between gap-2"
                  action
                  onClick={function() { handleOpen(playlist.id) }}
                  data-testid={'open-saved-playlist-' + playlist.id}
                >
                  <span>
                    <strong>{playlist.name}</strong>
                    <span className="text-muted ms-2">
                      {count} song{count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="d-flex align-items-center gap-1 flex-shrink-0">
                    {googleDocumentId && token ? (
                      <span onClick={function(e) { e.stopPropagation() }}>
                        <ShareTunebookModal
                          tunebook={tunebook}
                          token={token}
                          login={login}
                          googleDocumentId={googleDocumentId}
                          shareKind="playlist"
                          playlistId={playlist.id}
                          playlistName={playlist.name}
                          tunes={tunes}
                          saveTune={tunebook && tunebook.saveTune}
                          tiny={true}
                          variant="outline-info"
                          buttonSize="sm"
                        />
                      </span>
                    ) : null}
                    <Button
                      variant="outline-danger"
                      size="sm"
                      title="Delete saved playlist"
                      data-testid={'delete-saved-playlist-' + playlist.id}
                      onClick={function(e) { handleDelete(playlist.id, e) }}
                    >
                      {icons.deletebin}
                    </Button>
                  </span>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        )}
      </Modal.Body>
    </Modal>
  )
}
