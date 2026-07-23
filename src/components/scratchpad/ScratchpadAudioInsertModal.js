import { useEffect, useMemo, useState } from 'react'
import { Button, Form, ListGroup, Modal, Nav, Spinner, Tab } from 'react-bootstrap'
import { listItems, listAllScratchpadItems, listWorkspaces } from '../../scratchpadStore'
import { getLinkedMediaSources } from '../../mediaTranscriptionSources'
import { getLinkTrimBounds } from '../../mediaAudioTrim'
import {
  resolveScratchpadItemAudioBlob,
  resolveTuneLinkAudioBlob,
  listScratchpadItemAudioSources,
  getScratchpadItemDuration,
  linkCanInsertAsAudio,
} from '../../scratchpadAudioInsert'
import { formatMarkerTime } from '../../scratchpadAudioMarkers'

function formatTrimRange(link) {
  if (!link) return ''
  const bounds = getLinkTrimBounds(link)
  if (!bounds.startSec && !bounds.endSec) return ''
  const end = bounds.endSec > 0 ? formatMarkerTime(bounds.endSec) : 'end'
  return formatMarkerTime(bounds.startSec) + ' – ' + end
}

export default function ScratchpadAudioInsertModal(props) {
  const item = props.item
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const [tab, setTab] = useState('scratchpad')
  const [workspaceOnly, setWorkspaceOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [sourceKey, setSourceKey] = useState('mixdown')
  const [durations, setDurations] = useState({})
  const [tuneSearch, setTuneSearch] = useState('')
  const [selectedTuneId, setSelectedTuneId] = useState('')
  const [selectedLinkIndex, setSelectedLinkIndex] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const workspaceMap = useMemo(function() {
    const map = {}
    listWorkspaces().forEach(function(ws) { map[ws.id] = ws.name })
    return map
  }, [props.show])

  const scratchpadItems = useMemo(function() {
    const q = String(search || '').trim().toLowerCase()
    let list = workspaceOnly && item && item.workspaceId
      ? listItems(item.workspaceId)
      : listAllScratchpadItems()
    list = list.filter(function(it) {
      if (!it || it.type !== 'audio') return false
      if (item && it.id === item.id) return false
      if (!q) return true
      return String(it.title || '').toLowerCase().indexOf(q) >= 0
    })
    return list.sort(function(a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''))
    })
  }, [workspaceOnly, item, search, props.show])

  const selectedScratchpadItem = selectedItemId
    ? scratchpadItems.find(function(it) { return it.id === selectedItemId })
    : null

  const audioSources = useMemo(function() {
    if (!selectedScratchpadItem) return []
    return listScratchpadItemAudioSources(selectedScratchpadItem)
  }, [selectedScratchpadItem])

  useEffect(function() {
    if (!props.show) return
    setTab('scratchpad')
    setWorkspaceOnly(true)
    setSearch('')
    setSelectedItemId('')
    setSourceKey('mixdown')
    setTuneSearch('')
    setSelectedTuneId('')
    setSelectedLinkIndex(null)
    setError('')
    setBusy(false)
  }, [props.show])

  useEffect(function() {
    if (!props.show || !scratchpadItems.length) return
    let cancelled = false
    async function loadDurations() {
      const next = {}
      for (let i = 0; i < scratchpadItems.length; i += 1) {
        const it = scratchpadItems[i]
        try {
          next[it.id] = await getScratchpadItemDuration(it)
        } catch (e) { /* skip */ }
      }
      if (!cancelled) setDurations(next)
    }
    loadDurations()
    return function() { cancelled = true }
  }, [props.show, scratchpadItems])

  useEffect(function() {
    if (!audioSources.length) return
    const has = audioSources.some(function(s) { return s.id === sourceKey })
    if (!has) setSourceKey(audioSources[0].id)
  }, [audioSources, sourceKey])

  const tuneList = useMemo(function() {
    const q = String(tuneSearch || '').trim().toLowerCase()
    return Object.keys(tunes).map(function(id) { return tunes[id] }).filter(function(tune) {
      if (!tune || !tune.id) return false
      if (!q) return true
      const name = String(tune.name || '').toLowerCase()
      const composer = String(tune.composer || '').toLowerCase()
      return name.indexOf(q) >= 0 || composer.indexOf(q) >= 0
    }).sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''))
    }).slice(0, 50)
  }, [tunes, tuneSearch])

  const selectedTune = selectedTuneId ? tunes[selectedTuneId] : null
  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink

  const tuneLinks = useMemo(function() {
    if (!selectedTune) return []
    return getLinkedMediaSources(selectedTune, tunebook).filter(function(src) {
      const link = selectedTune.links[src.linkIndex]
      return link && linkCanInsertAsAudio(link, isYoutubeLink)
    })
  }, [selectedTune, tunebook, isYoutubeLink])

  async function handleInsert() {
    setBusy(true)
    setError('')
    try {
      let blob = null
      if (tab === 'scratchpad') {
        if (!selectedScratchpadItem) throw new Error('Select a scratchpad item')
        const srcOpt = audioSources.find(function(s) { return s.id === sourceKey }) || audioSources[0]
        blob = await resolveScratchpadItemAudioBlob(selectedScratchpadItem, {
          source: srcOpt && srcOpt.source,
          trackId: srcOpt && srcOpt.trackId,
          takeId: srcOpt && srcOpt.takeId,
        })
      } else {
        if (!selectedTune || selectedLinkIndex == null) throw new Error('Select tune media')
        blob = await resolveTuneLinkAudioBlob({
          tune: selectedTune,
          linkIndex: selectedLinkIndex,
          tunebook: tunebook,
          token: props.token,
          isYoutubeLink: isYoutubeLink,
        })
      }
      if (!blob || blob.size <= 0) throw new Error('No audio data')
      if (props.onInsert) await props.onInsert(blob)
      if (props.onHide) props.onHide()
    } catch (e) {
      setError(e && e.message ? e.message : 'Insert failed')
    } finally {
      setBusy(false)
    }
  }

  const canInsert = tab === 'scratchpad'
    ? !!(selectedScratchpadItem && audioSources.length)
    : !!(selectedTune && selectedLinkIndex != null)

  return (
    <Modal show={props.show} onHide={props.onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Insert audio</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Tab.Container activeKey={tab} onSelect={function(k) { if (k) setTab(k) }}>
          <Nav variant="tabs" className="mb-3">
            <Nav.Item><Nav.Link eventKey="scratchpad">From scratchpad</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="tune">From tune</Nav.Link></Nav.Item>
          </Nav>
          <Tab.Content>
            <Tab.Pane eventKey="scratchpad">
              <Form.Check
                type="checkbox"
                className="mb-2 small"
                label="This workspace only"
                checked={workspaceOnly}
                onChange={function(e) { setWorkspaceOnly(e.target.checked) }}
              />
              <Form.Control
                size="sm"
                className="mb-2"
                placeholder="Search scratchpad audio…"
                value={search}
                onChange={function(e) { setSearch(e.target.value) }}
              />
              <ListGroup style={{ maxHeight: '14rem', overflowY: 'auto' }}>
                {scratchpadItems.length ? scratchpadItems.map(function(it) {
                  return (
                    <ListGroup.Item
                      key={it.id}
                      action
                      active={selectedItemId === it.id}
                      onClick={function() { setSelectedItemId(it.id) }}
                    >
                      <div className="d-flex justify-content-between gap-2">
                        <span>{it.title || 'Untitled'}</span>
                        <span className="text-muted small">
                          {!workspaceOnly && it.workspaceId ? (workspaceMap[it.workspaceId] || '') + ' · ' : ''}
                          {durations[it.id] ? formatMarkerTime(durations[it.id]) + 's' : ''}
                        </span>
                      </div>
                    </ListGroup.Item>
                  )
                }) : (
                  <ListGroup.Item disabled>No audio items found</ListGroup.Item>
                )}
              </ListGroup>
              {selectedScratchpadItem && audioSources.length > 1 ? (
                <Form.Group className="mt-2 mb-0">
                  <Form.Label className="small mb-1">Source</Form.Label>
                  <Form.Control
                    size="sm"
                    as="select"
                    value={sourceKey}
                    onChange={function(e) { setSourceKey(e.target.value) }}
                  >
                    {audioSources.map(function(src) {
                      return <option key={src.id} value={src.id}>{src.label}</option>
                    })}
                  </Form.Control>
                </Form.Group>
              ) : null}
            </Tab.Pane>
            <Tab.Pane eventKey="tune">
              <Form.Control
                size="sm"
                className="mb-2"
                placeholder="Search tunes…"
                value={tuneSearch}
                onChange={function(e) { setTuneSearch(e.target.value) }}
              />
              <div className="row g-2">
                <div className="col-md-5">
                  <ListGroup style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                    {tuneList.map(function(tune) {
                      return (
                        <ListGroup.Item
                          key={tune.id}
                          action
                          active={selectedTuneId === tune.id}
                          onClick={function() {
                            setSelectedTuneId(tune.id)
                            setSelectedLinkIndex(null)
                          }}
                        >
                          {tune.name || tune.id}
                        </ListGroup.Item>
                      )
                    })}
                  </ListGroup>
                </div>
                <div className="col-md-7">
                  <ListGroup style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                    {selectedTune ? (
                      tuneLinks.length ? tuneLinks.map(function(src) {
                        const link = selectedTune.links[src.linkIndex]
                        const trim = formatTrimRange(link)
                        return (
                          <ListGroup.Item
                            key={src.id}
                            action
                            active={selectedLinkIndex === src.linkIndex}
                            onClick={function() { setSelectedLinkIndex(src.linkIndex) }}
                          >
                            <div>{src.label}</div>
                            <div className="small text-muted">
                              {src.srcType}{trim ? ' · ' + trim : ''}
                            </div>
                          </ListGroup.Item>
                        )
                      }) : (
                        <ListGroup.Item disabled>No importable media links</ListGroup.Item>
                      )
                    ) : (
                      <ListGroup.Item disabled>Select a tune</ListGroup.Item>
                    )}
                  </ListGroup>
                </div>
              </div>
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
        {error ? <div className="text-danger small mt-2">{error}</div> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={handleInsert} disabled={!canInsert || busy}>
          {busy ? <><Spinner animation="border" size="sm" className="me-1" /> Loading…</> : 'Insert at playhead'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
