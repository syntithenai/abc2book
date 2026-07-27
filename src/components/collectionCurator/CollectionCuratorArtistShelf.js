import { useCallback, useEffect, useState } from 'react'
import { Collapse, ListGroup, Spinner } from 'react-bootstrap'
import { browseMusicCollection, fetchMusicCollectionArtists, setMusicCollectionTriageBulk } from '../../musicCollectionCuratorClient'
import { buildArtUrl } from '../../collectionCuratorUtils'
import { mediaSearchPathStyle } from '../../mediaLinkSearchDisplay'
import { MediaSearchResultImage } from '../MediaSearchResultDetails'
import MusicCollectionStreamPlayer from '../MusicCollectionStreamPlayer'
import CollectionCuratorTriageButtons from './CollectionCuratorTriageButtons'

export default function CollectionCuratorArtistShelf(props) {
  const [artists, setArtists] = useState([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [expandedArtist, setExpandedArtist] = useState('')
  const [tracks, setTracks] = useState([])
  const [tracksBusy, setTracksBusy] = useState(false)

  const load = useCallback(async function() {
    setBusy(true)
    try {
      const body = await fetchMusicCollectionArtists({
        phase: props.phase,
        query: props.query,
        limit: 100,
        accessToken: props.token,
      })
      setArtists(body.artists || [])
      setTotal(body.total || 0)
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Could not load artists')
    } finally {
      setBusy(false)
    }
  }, [props.phase, props.query, props.token, props.onError])

  useEffect(function() {
    load()
  }, [load])

  async function bulkTriage(artist, status) {
    try {
      const result = await setMusicCollectionTriageBulk({
        scope: 'artist',
        value: artist,
        phase: props.phase,
        status: status,
        accessToken: props.token,
      })
      props.onMessage('Updated ' + (result.updated || 0) + ' tracks for ' + artist)
      await load()
      if (expandedArtist === artist) await loadTracks(artist)
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Bulk triage failed')
    }
  }

  async function loadTracks(artist) {
    setTracksBusy(true)
    try {
      const body = await browseMusicCollection({
        phase: props.phase,
        artist: artist,
        limit: 40,
        accessToken: props.token,
      })
      setTracks(body.entries || [])
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Could not load tracks')
    } finally {
      setTracksBusy(false)
    }
  }

  async function toggleArtist(artist) {
    if (expandedArtist === artist) {
      setExpandedArtist('')
      setTracks([])
      return
    }
    setExpandedArtist(artist)
    await loadTracks(artist)
  }

  if (busy) return <Spinner animation="border" size="sm" />
  return (
    <div>
      <div className="small text-muted mb-2">{total} artists in this phase</div>
      <ListGroup>
        {artists.map(function(row) {
          const open = expandedArtist === row.artist
          return (
            <ListGroup.Item key={row.artist}>
              <div className="d-flex flex-wrap gap-2 align-items-start justify-content-between">
                <button
                  type="button"
                  className="btn btn-link p-0 text-start text-decoration-none flex-grow-1"
                  onClick={function() { toggleArtist(row.artist) }}
                >
                  <div className="fw-semibold">{row.artist}</div>
                  <div className="small text-muted">
                    {row.trackCount} tracks · keep {row.keepCount} · review {row.maybeCount} · cull {row.cullCount} · unset {row.unsetCount}
                    {row.totalPlayCount ? ' · ' + row.totalPlayCount + ' plays' : ''}
                  </div>
                </button>
                <CollectionCuratorTriageButtons
                  vertical={false}
                  busy={busy}
                  onTriage={function(status) { bulkTriage(row.artist, status) }}
                />
              </div>
              <Collapse in={open}>
                <div className="mt-2">
                  {tracksBusy ? <Spinner animation="border" size="sm" /> : null}
                  {tracks.map(function(entry) {
                    const artItem = {
                      source: 'music-collection',
                      image: buildArtUrl(entry.id, props.resolverBase),
                      title: entry.title,
                    }
                    return (
                      <div key={entry.id} className="d-flex gap-2 border-top pt-2 mt-2 align-items-start">
                        <MediaSearchResultImage item={artItem} token={props.token} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div className="small fw-semibold text-truncate">{entry.title || 'Track'}</div>
                          <div style={mediaSearchPathStyle} className="text-truncate">{entry.path}</div>
                          <MusicCollectionStreamPlayer path={entry.path} token={props.token} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Collapse>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </div>
  )
}
