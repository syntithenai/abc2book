import { Button, Col, Form, Row } from 'react-bootstrap'
import { CURATOR_PHASES } from '../../collectionCuratorUtils'

export default function CollectionCuratorPhaseBar(props) {
  const p = props
  return (
    <Row className="g-2 mb-3 align-items-end">
      <Col md={3}>
        <Form.Label className="small text-muted mb-1">Phase</Form.Label>
        <Form.Select value={p.phase} onChange={function(e) { p.onPhaseChange(e.target.value) }}>
          {CURATOR_PHASES.map(function(item) {
            return <option key={item.id} value={item.id}>{item.label}</option>
          })}
        </Form.Select>
      </Col>
      {p.showSearch !== false ? (
        <Col md={4}>
          <Form.Label className="small text-muted mb-1">Search</Form.Label>
          <Form.Control
            placeholder="Title, artist, path…"
            value={p.query}
            onChange={function(e) { p.onQueryChange(e.target.value) }}
          />
        </Col>
      ) : null}
      {p.showTriageFilter ? (
        <Col md={3}>
          <Form.Label className="small text-muted mb-1">Triage filter</Form.Label>
          <Form.Select value={p.triageFilter} onChange={function(e) { p.onTriageFilterChange(e.target.value) }}>
            <option value="">All</option>
            <option value="keep">Keep</option>
            <option value="maybe">Review later</option>
            <option value="cull">Cull</option>
          </Form.Select>
        </Col>
      ) : null}
      {p.showUnplayed ? (
        <Col md={2}>
          <Form.Check
            type="switch"
            id="curator-unplayed-only"
            label="Unplayed only"
            checked={!!p.unplayedOnly}
            onChange={function(e) { p.onUnplayedOnlyChange(e.target.checked) }}
          />
        </Col>
      ) : null}
      {p.onRefresh ? (
        <Col md="auto">
          <Button variant="outline-secondary" size="sm" onClick={p.onRefresh}>Refresh</Button>
        </Col>
      ) : null}
    </Row>
  )
}
