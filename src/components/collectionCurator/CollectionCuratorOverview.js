import { Button, Col, ListGroup, Row } from 'react-bootstrap'
import { topStatItems } from '../../collectionCuratorUtils'
import { createMusicCollectionMovePlan, setMusicCollectionTriageBulk } from '../../musicCollectionCuratorClient'

export default function CollectionCuratorOverview(props) {
  const stats = props.stats
  const dupStats = stats && stats.duplicates ? stats.duplicates.songKey : null
  const topGenres = topStatItems(stats && stats.genres, 8)
  const topArtists = topStatItems(stats && stats.artists, 8)
  const mostPlayed = stats && stats.playback ? stats.playback.mostPlayed || [] : []

  async function bulkShortcut(options) {
    try {
      const result = await setMusicCollectionTriageBulk(Object.assign({
        phase: props.phase,
        accessToken: props.token,
      }, options))
      props.onMessage('Updated ' + (result.updated || 0) + ' tracks')
      if (props.onRefresh) props.onRefresh()
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Bulk update failed')
    }
  }

  async function planMoves(type) {
    try {
      const result = await createMusicCollectionMovePlan({
        type: type,
        phase: props.phase,
        triageOnly: type === 'library',
        accessToken: props.token,
      })
      props.onMessage('Plan #' + result.planId + ' with ' + (result.plan && result.plan.moveCount || 0) + ' moves (dry-run)')
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Move plan failed')
    }
  }

  return (
    <div>
      <Row className="g-3 mb-3">
        <Col md={4}>
          <div className="border rounded p-2">
            <strong>Library health</strong>
            {stats ? (
              <ul className="small mb-0 mt-2">
                <li>Tracks indexed: {stats.tracks}</li>
                <li>Tagged title: {stats.metadata && stats.metadata.taggedTitle}</li>
                <li>Tagged artist: {stats.metadata && stats.metadata.taggedArtist}</li>
                <li>With BPM: {stats.metadata && stats.metadata.taggedBpm}</li>
                <li>Duplicate extras: {dupStats && dupStats.extraCopies}</li>
              </ul>
            ) : <div className="small text-muted">No stats</div>}
          </div>
        </Col>
        <Col md={4}>
          <div className="border rounded p-2">
            <strong>Taste profile</strong>
            {stats ? (
              <div className="small mt-2">
                <div className="mb-2">
                  <span className="text-muted">Top genres</span>
                  <ul className="mb-0 ps-3">
                    {topGenres.map(function(item) {
                      return <li key={item.value}>{item.value} ({item.count})</li>
                    })}
                  </ul>
                </div>
                <div>
                  <span className="text-muted">Top artists</span>
                  <ul className="mb-0 ps-3">
                    {topArtists.map(function(item) {
                      return <li key={item.value} className="text-truncate">{item.value} ({item.count})</li>
                    })}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </Col>
        <Col md={4}>
          <div className="border rounded p-2">
            <strong>Quick actions</strong>
            <div className="d-flex flex-wrap gap-2 mt-2">
              <Button size="sm" variant="outline-primary" onClick={function() { planMoves('library') }}>Plan library moves</Button>
              <Button size="sm" variant="outline-secondary" onClick={function() { planMoves('duplicates') }}>Plan duplicate quarantine</Button>
            </div>
            <div className="d-flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                variant="outline-warning"
                onClick={function() {
                  bulkShortcut({ scope: 'filter', status: 'maybe', playCountMax: 0, triageUnsetOnly: true })
                }}
              >
                Review later: all unplayed
              </Button>
              <Button
                size="sm"
                variant="outline-success"
                onClick={function() {
                  bulkShortcut({ scope: 'filter', status: 'keep', playCountMin: 3, triageUnsetOnly: true })
                }}
              >
                Keep: played 3+ times
              </Button>
            </div>
            {props.registry && props.registry.preserve ? (
              <div className="small text-muted mt-2">
                Preserved: {(props.registry.preserve || []).join(', ')}
              </div>
            ) : null}
          </div>
        </Col>
      </Row>
      {mostPlayed.length ? (
        <div>
          <h6>Most played</h6>
          <ListGroup>
            {mostPlayed.slice(0, 8).map(function(row) {
              return (
                <ListGroup.Item key={row.id} className="small py-1">
                  <div className="fw-semibold text-truncate">{row.title}</div>
                  <div className="text-muted text-truncate">{row.artist} · {row.playCount} plays</div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </div>
      ) : null}
    </div>
  )
}
