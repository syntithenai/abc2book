import { useCallback, useEffect, useState } from 'react'
import { Button, ButtonGroup, ListGroup, Spinner } from 'react-bootstrap'
import { browseMusicCollection, setMusicCollectionTriage } from '../../musicCollectionCuratorClient'
import { buildArtUrl } from '../../collectionCuratorUtils'
import { mediaSearchPathStyle } from '../../mediaLinkSearchDisplay'
import { MediaSearchResultImage } from '../MediaSearchResultDetails'
import MusicCollectionStreamPlayer from '../MusicCollectionStreamPlayer'

export default function CollectionCuratorTrackList(props) {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async function() {
    setBusy(true)
    try {
      const body = await browseMusicCollection({
        phase: props.phase,
        query: props.query,
        triageStatus: props.triageFilter,
        unplayedOnly: props.unplayedOnly,
        limit: 80,
        accessToken: props.token,
      })
      setEntries(body.entries || [])
      setTotal(body.total || 0)
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Could not load tracks')
    } finally {
      setBusy(false)
    }
  }, [props.phase, props.query, props.triageFilter, props.unplayedOnly, props.token, props.onError])

  useEffect(function() {
    load()
  }, [load])

  async function triage(entryId, status) {
    try {
      await setMusicCollectionTriage({ entryId: entryId, status: status, accessToken: props.token })
      props.onMessage('Marked ' + (status === 'maybe' ? 'review later' : status))
      await load()
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Triage failed')
    }
  }

  return (
    <div>
      {busy ? <Spinner animation="border" size="sm" className="mb-2" /> : null}
      <div className="small text-muted mb-2">{total} matches · per-track decisions only</div>
      <ListGroup>
        {entries.map(function(entry) {
          const artItem = {
            source: 'music-collection',
            image: buildArtUrl(entry.id, props.resolverBase),
            title: entry.title,
          }
          return (
            <ListGroup.Item key={entry.id} className="d-flex gap-2 align-items-start">
              <MediaSearchResultImage item={artItem} token={props.token} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="fw-semibold text-truncate">{entry.title || 'Track'}</div>
                <div className="text-truncate">{entry.artist || 'Unknown artist'}</div>
                <div className="small text-muted">{entry.genre || '—'} · BPM {entry.bpm || '—'} · plays {entry.playCount || 0}</div>
                <div style={mediaSearchPathStyle} className="text-truncate">{entry.path}</div>
                <MusicCollectionStreamPlayer path={entry.path} token={props.token} style={{ marginTop: 6 }} />
              </div>
              <ButtonGroup vertical size="sm">
                <Button variant="success" onClick={function() { triage(entry.id, 'keep') }}>Keep</Button>
                <Button variant="warning" onClick={function() { triage(entry.id, 'maybe') }}>Review later</Button>
                <Button variant="outline-danger" onClick={function() { triage(entry.id, 'cull') }}>Cull</Button>
              </ButtonGroup>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </div>
  )
}
