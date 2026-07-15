import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Form, ListGroup, Modal, Tab, Tabs } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  formatBytes,
  formatCacheDate,
  getAudioCacheTuneSummaries,
  getMidiCacheTuneSummaries,
  getStemCacheTuneSummaries,
} from '../mediaCacheStorage'
import {
  getLockedTuneIdSet,
  isMediaCacheLocked,
  setMediaCacheLockForTunes,
} from '../mediaCacheLock'
import {
  getTuneOwnedMediaDriveSummary,
  ownedMediaDriveStatusLabel,
  ownedMediaDriveStatusVariant,
} from '../linkRecording'

const TAB_AUDIO = 'audio'
const TAB_STEMS = 'stems'
const TAB_MIDI = 'midi'

function getTuneById(tunes, tuneId) {
  if (!tunes || !tuneId) return null
  return tunes[tuneId] || tunes[String(tuneId)] || null
}

function getTuneDisplayInfo(tunes, deletedTunes, tuneId) {
  const tune = getTuneById(tunes, tuneId)
  if (tune) {
    return {
      tune: tune,
      name: tune.name ? tune.name : tuneId,
      composer: tune.composer ? tune.composer : '',
      books: Array.isArray(tune.books) ? tune.books : [],
      tags: Array.isArray(tune.tags) ? tune.tags : [],
    }
  }
  const tombstone = deletedTunes
    ? (deletedTunes[tuneId] || deletedTunes[String(tuneId)])
    : null
  if (tombstone && tombstone.name) {
    return {
      tune: null,
      name: tombstone.name,
      composer: '',
      books: [],
      tags: [],
      deleted: true,
    }
  }
  return {
    tune: null,
    name: tuneId,
    composer: '',
    books: [],
    tags: [],
  }
}

function sortTuneRows(rows) {
  return rows.slice().sort(function(a, b) {
    const nameA = (a.name || a.tuneId || '').toLowerCase()
    const nameB = (b.name || b.tuneId || '').toLowerCase()
    if (nameA < nameB) return -1
    if (nameA > nameB) return 1
    return 0
  })
}

function buildTuneRows(summaries, tunes, deletedTunes) {
  return sortTuneRows((summaries || []).map(function(summary) {
    const info = getTuneDisplayInfo(tunes, deletedTunes, summary.tuneId)
    return {
      tuneId: summary.tuneId,
      name: info.name,
      composer: info.composer,
      books: info.books,
      tags: info.tags,
      deleted: !!info.deleted,
      locked: isMediaCacheLocked(info.tune),
      driveSummary: getTuneOwnedMediaDriveSummary(info.tune),
      bytes: summary.bytes || 0,
      cachedAt: summary.cachedAt || 0,
      entries: summary.entries || 0,
      tune: info.tune,
    }
  }))
}

function tuneMatchesFilter(row, filterText) {
  if (!filterText || !filterText.trim()) return true
  const q = filterText.trim().toLowerCase()
  const parts = [row.name, row.composer]
  row.books.forEach(function(book) { parts.push(book) })
  row.tags.forEach(function(tag) { parts.push(tag) })
  return parts.some(function(part) {
    return part && String(part).toLowerCase().indexOf(q) !== -1
  })
}

export default function MediaCacheTunesModal(props) {
  const tunebook = props.tunebook
  const tunes = props.tunes || {}
  const deletedTunes = props.deletedTunes || {}
  const icons = tunebook && tunebook.icons ? tunebook.icons : {}
  const utils = tunebook && tunebook.utils ? tunebook.utils : null
  const [activeTab, setActiveTab] = useState(TAB_AUDIO)
  const [filterText, setFilterText] = useState('')
  const [summaries, setSummaries] = useState({ audio: [], stems: [], midi: [] })
  const [loading, setLoading] = useState(false)

  const refreshSummaries = useCallback(function() {
    setLoading(true)
    return Promise.all([
      getAudioCacheTuneSummaries(),
      getStemCacheTuneSummaries(),
      getMidiCacheTuneSummaries(tunes),
    ]).then(function(results) {
      setSummaries({
        audio: results[0] || [],
        stems: results[1] || [],
        midi: results[2] || [],
      })
      setLoading(false)
      return results
    }).catch(function() {
      setLoading(false)
      return null
    })
  }, [tunes])

  useEffect(function() {
    if (!props.show) return
    setFilterText('')
    refreshSummaries()
  }, [props.show, refreshSummaries, props.tunesHash])

  const audioRows = useMemo(function() {
    return buildTuneRows(summaries.audio, tunes, deletedTunes).filter(function(row) {
      return tuneMatchesFilter(row, filterText)
    })
  }, [summaries.audio, tunes, deletedTunes, filterText])

  const stemRows = useMemo(function() {
    return buildTuneRows(summaries.stems, tunes, deletedTunes).filter(function(row) {
      return tuneMatchesFilter(row, filterText)
    })
  }, [summaries.stems, tunes, deletedTunes, filterText])

  const midiRows = useMemo(function() {
    return buildTuneRows(summaries.midi, tunes, deletedTunes).filter(function(row) {
      return tuneMatchesFilter(row, filterText)
    })
  }, [summaries.midi, tunes, deletedTunes, filterText])

  function handleLock(row, locked) {
    const tune = row.tune || getTuneById(tunes, row.tuneId)
    if (!tune) {
      toast.warning('Tune not found — cannot change lock state.')
      return
    }
    setMediaCacheLockForTunes(tunebook, [tune], locked)
    if (props.forceRefresh) props.forceRefresh()
  }

  function handleClearCache(row, kind) {
    if (!utils) return
    const tuneIds = [row.tuneId]
    let clearPromise
    if (kind === TAB_AUDIO) {
      clearPromise = utils.clearDownloadedAudioCacheForTunes(tuneIds)
    } else if (kind === TAB_STEMS) {
      clearPromise = utils.clearStemsCacheForTunes(tuneIds)
    } else {
      clearPromise = utils.clearMidiCacheForTunes(tuneIds)
    }
    Promise.resolve(clearPromise).then(function(result) {
      const removed = result && result.removed != null ? result.removed : 0
      if (removed > 0) {
        toast.success('Cleared ' + kind + ' cache for "' + row.name + '".')
      }
      refreshSummaries()
      if (props.onCacheChanged) props.onCacheChanged()
    }).catch(function() {
      toast.error('Could not clear cache for "' + row.name + '".')
    })
  }

  function renderFilterField() {
    return (
      <Form.Group className="media-cache-tunes-filter">
        <Form.Label htmlFor="media-cache-tunes-filter" className="visually-hidden">
          Filter cached tunes
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          id="media-cache-tunes-filter"
          className="media-cache-tunes-filter-input"
          value={filterText}
          placeholder="Filter by title, artist, book, or tag"
          onChange={function(e) { setFilterText(e.target.value) }}
        />
      </Form.Group>
    )
  }

  function renderDriveStatus(row) {
    if (!row.driveSummary) return null
    const summary = row.driveSummary
    let detail = ownedMediaDriveStatusLabel(summary.status)
    if (summary.total > 1) {
      detail += ' (' + summary.synced + '/' + summary.total + ')'
    }
    return (
      <Badge bg={ownedMediaDriveStatusVariant(summary.status)} className="media-cache-tunes-drive-badge">
        {detail}
      </Badge>
    )
  }

  function renderRows(rows, kind) {
    const showLockControls = kind !== TAB_MIDI
    if (loading && !summaries.audio.length && !summaries.stems.length && !summaries.midi.length) {
      return <p className="app-text-muted media-cache-tunes-empty">Loading cached tunes…</p>
    }
    if (!rows.length) {
      return <p className="app-text-muted media-cache-tunes-empty">No matching tunes with {kind} cache.</p>
    }
    return (
      <ListGroup className="media-cache-tunes-list">
        {rows.map(function(row, index) {
          return (
            <ListGroup.Item
              key={row.tuneId}
              className={'media-cache-tunes-row ' + (index % 2 === 0 ? 'even' : 'odd')}
            >
              <div className="media-cache-tunes-row-main">
                <div className="media-cache-tunes-title-block">
                  <span className="media-cache-tunes-name">{row.name}</span>
                  {row.composer ? (
                    <span className="media-cache-tunes-artist app-text-muted">{row.composer}</span>
                  ) : null}
                  {row.deleted ? (
                    <span className="media-cache-tunes-artist app-text-muted">Deleted tune</span>
                  ) : null}
                </div>
                <div className="media-cache-tunes-meta">
                  <span>{formatBytes(row.bytes)}</span>
                  <span className="media-cache-tunes-meta-sep">·</span>
                  <span>{formatCacheDate(row.cachedAt)}</span>
                  {row.entries > 1 ? (
                    <>
                      <span className="media-cache-tunes-meta-sep">·</span>
                      <span>{row.entries} entries</span>
                    </>
                  ) : null}
                </div>
                {renderDriveStatus(row)}
                {showLockControls && row.locked ? (
                  <Badge bg="secondary" className="media-cache-tunes-lock-badge">Locked</Badge>
                ) : null}
              </div>
              <div className="media-cache-tunes-row-actions">
                {showLockControls ? (
                  row.locked ? (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      className="media-cache-tunes-action-btn"
                      aria-label={'Unlock cache for ' + row.name}
                      title="Unlock cache"
                      onClick={function() { handleLock(row, false) }}
                    >
                      {icons.unlock}
                      <span className="media-cache-tunes-action-label">Unlock</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      className="media-cache-tunes-action-btn"
                      aria-label={'Lock cache for ' + row.name}
                      title="Lock cache"
                      onClick={function() { handleLock(row, true) }}
                    >
                      {icons.lock}
                      <span className="media-cache-tunes-action-label">Lock</span>
                    </Button>
                  )
                ) : null}
                <Button
                  size="sm"
                  variant="outline-warning"
                  className="media-cache-tunes-action-btn"
                  aria-label={'Clear ' + kind + ' cache for ' + row.name}
                  title="Clear cache"
                  onClick={function() { handleClearCache(row, kind) }}
                >
                  {icons.deletebin}
                  <span className="media-cache-tunes-action-label">Clear</span>
                </Button>
              </div>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    )
  }

  const totalAudio = summaries.audio.length
  const totalStems = summaries.stems.length
  const totalMidi = summaries.midi.length

  return (
    <Modal
      show={props.show}
      onHide={props.onHide}
      fullscreen
      scrollable
      className="media-cache-tunes-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Tunes with media cache</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {renderFilterField()}
        <Tabs
          activeKey={activeTab}
          onSelect={function(key) { setActiveTab(key || TAB_AUDIO) }}
          className="media-cache-tunes-tabs"
        >
          <Tab eventKey={TAB_AUDIO} title={'Audio (' + audioRows.length + (filterText ? '/' + totalAudio : '') + ')'}>
            <div className="media-cache-tunes-tab-panel">
              {renderRows(audioRows, TAB_AUDIO)}
            </div>
          </Tab>
          <Tab eventKey={TAB_STEMS} title={'Stems (' + stemRows.length + (filterText ? '/' + totalStems : '') + ')'}>
            <div className="media-cache-tunes-tab-panel">
              {renderRows(stemRows, TAB_STEMS)}
            </div>
          </Tab>
          <Tab eventKey={TAB_MIDI} title={'MIDI (' + midiRows.length + (filterText ? '/' + totalMidi : '') + ')'}>
            <div className="media-cache-tunes-tab-panel">
              {renderRows(midiRows, TAB_MIDI)}
            </div>
          </Tab>
        </Tabs>
      </Modal.Body>
    </Modal>
  )
}

export function getLockedTuneIdsForClear(tunes) {
  return getLockedTuneIdSet(tunes)
}
