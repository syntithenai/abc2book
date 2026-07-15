import { useEffect, useMemo, useState } from 'react'
import { Form, ListGroup, Modal } from 'react-bootstrap'
import { listSavedPlaylists } from '../savedPlaylistsStore'
import { listPerformanceSets } from '../performanceSetStore'

function itemCount(list, kind) {
  if (!list || !Array.isArray(list.items)) return 0
  if (kind === 'setlist') {
    return list.items.filter(function(item) {
      return item && item.type === 'tune' && item.tuneId
    }).length
  }
  return list.items.length
}

/**
 * Pick an existing playlist or setlist and append selected tune ids.
 *
 * @param {'playlist'|'setlist'} props.kind
 * @param {string[]} props.tuneIds
 * @param {(list: object) => void} props.onSelect
 */
export default function AddTunesToListModal({
  show,
  onHide,
  kind,
  tuneIds,
  onSelect,
  title,
}) {
  const [lists, setLists] = useState([])
  const [search, setSearch] = useState('')
  const isPlaylist = kind === 'playlist'
  const noun = isPlaylist ? 'playlist' : 'setlist'
  const nounPlural = isPlaylist ? 'playlists' : 'setlists'
  const tuneCount = Array.isArray(tuneIds) ? tuneIds.length : 0

  useEffect(function() {
    if (!show) return
    setLists(isPlaylist ? listSavedPlaylists() : listPerformanceSets())
    setSearch('')
  }, [show, isPlaylist])

  const filtered = useMemo(function() {
    const q = String(search || '').trim().toLowerCase()
    if (!q) return lists
    return lists.filter(function(list) {
      return String(list.name || '').toLowerCase().indexOf(q) !== -1
    })
  }, [lists, search])

  function handlePick(list) {
    if (!list || !list.id) return
    if (typeof onSelect === 'function') onSelect(list)
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      onClick={function(e) { e.stopPropagation() }}
      size="md"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {title || ('Add ' + tuneCount + ' tune' + (tuneCount === 1 ? '' : 's') + ' to ' + noun)}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <Form.Control
          type="search"
          className="mb-3"
          placeholder={'Search ' + nounPlural}
          value={search}
          onChange={function(e) { setSearch(e.target.value) }}
          data-testid={'add-to-' + kind + '-search'}
          aria-label={'Search ' + nounPlural}
          autoFocus
        />

        {lists.length === 0 ? (
          <p className="text-muted mb-0">
            No saved {nounPlural} yet. Use Create to make one from this selection.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-muted mb-0">No {nounPlural} match your search.</p>
        ) : (
          <ListGroup>
            {filtered.map(function(list) {
              const count = itemCount(list, kind)
              return (
                <ListGroup.Item
                  key={list.id}
                  action
                  className="d-flex align-items-center justify-content-between gap-2"
                  onClick={function() { handlePick(list) }}
                  data-testid={'add-to-' + kind + '-' + list.id}
                >
                  <span>
                    <strong>{list.name || (isPlaylist ? 'Playlist' : 'Set')}</strong>
                    {list.date ? (
                      <span className="text-muted ms-2">{list.date}</span>
                    ) : null}
                    <span className="text-muted ms-2">
                      {count} tune{count === 1 ? '' : 's'}
                    </span>
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
