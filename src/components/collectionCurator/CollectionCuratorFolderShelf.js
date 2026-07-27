import { useCallback, useEffect, useState } from 'react'
import { Badge, ListGroup, Spinner } from 'react-bootstrap'
import { fetchMusicCollectionChunks, setMusicCollectionTriageBulk } from '../../musicCollectionCuratorClient'
import { mediaSearchPathStyle } from '../../mediaLinkSearchDisplay'
import CollectionCuratorTriageButtons from './CollectionCuratorTriageButtons'

export default function CollectionCuratorFolderShelf(props) {
  const [chunks, setChunks] = useState([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async function() {
    setBusy(true)
    try {
      const body = await fetchMusicCollectionChunks({
        phase: props.phase,
        query: props.query,
        limit: 100,
        accessToken: props.token,
      })
      setChunks(body.chunks || [])
      setTotal(body.total || 0)
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Could not load folders')
    } finally {
      setBusy(false)
    }
  }, [props.phase, props.query, props.token, props.onError])

  useEffect(function() {
    load()
  }, [load])

  async function bulkTriage(chunk, status, preserved) {
    if (preserved) return
    try {
      const result = await setMusicCollectionTriageBulk({
        scope: 'chunk',
        value: chunk,
        phase: props.phase,
        status: status,
        accessToken: props.token,
      })
      props.onMessage('Updated ' + (result.updated || 0) + ' tracks in ' + chunk)
      await load()
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Bulk triage failed')
    }
  }

  if (busy) return <Spinner animation="border" size="sm" />
  return (
    <div>
      <div className="small text-muted mb-2">{total} source folders in this phase</div>
      <ListGroup>
        {chunks.map(function(row) {
          return (
            <ListGroup.Item key={row.chunk}>
              <div className="d-flex flex-wrap gap-2 align-items-start justify-content-between">
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="fw-semibold text-truncate">
                    {row.chunk}
                    {row.preserved ? <Badge bg="secondary" className="ms-2">Preserved</Badge> : null}
                  </div>
                  <div className="small text-muted">
                    {row.trackCount} tracks · keep {row.keepCount} · review {row.maybeCount} · cull {row.cullCount} · unset {row.unsetCount}
                  </div>
                  {(row.samplePaths || []).slice(0, 2).map(function(sample) {
                    return <div key={sample} className="small text-truncate" style={mediaSearchPathStyle}>{sample}</div>
                  })}
                </div>
                {row.preserved ? null : (
                  <CollectionCuratorTriageButtons
                    vertical={false}
                    busy={busy}
                    onTriage={function(status) { bulkTriage(row.chunk, status, row.preserved) }}
                  />
                )}
              </div>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </div>
  )
}
