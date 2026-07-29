import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Row } from 'react-bootstrap';
import useSnapcastControl from '../hooks/useSnapcastControl';
import useSnapcastPlayback from '../hooks/useSnapcastPlayback';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { icons } from '../Icons';

function ClientVolumeSlider({ client, onChange }) {
  const config = client.config || {};
  const volume = config.volume || {};
  const percent = volume.percent != null ? volume.percent : 100;
  return (
    <div className="d-flex align-items-center gap-2 mb-1">
      <span className="small text-truncate" style={{ minWidth: '8rem' }}>
        {client.host && client.host.name ? client.host.name : client.id}
      </span>
      <Form.Range
        min={0}
        max={100}
        value={percent}
        onChange={function(e) {
          onChange(client.id, Number(e.target.value), !!volume.muted);
        }}
      />
      <span className="small text-muted" style={{ width: '2.5rem' }}>{percent}%</span>
    </div>
  );
}

function GroupCard({ group, streams, streamName, selected, onSelect, onSetStream, onClientVolume }) {
  const assigned = streams.find(function(s) { return s.name === streamName; });
  return (
    <Card className="mb-3">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <Card.Title className="h6 mb-0">{group.name || group.id}</Card.Title>
          <Button
            size="sm"
            variant={selected ? 'primary' : 'outline-secondary'}
            onClick={function() { onSelect(group.id); }}
          >
            {selected ? 'Target' : 'Select'}
          </Button>
        </div>
        {streams.length > 1 ? (
          <Form.Group className="mb-2">
            <Form.Label className="small">Stream</Form.Label>
            <Form.Select
              size="sm"
              value={assigned ? assigned.id : ''}
              onChange={function(e) {
                if (e.target.value) onSetStream(group.id, e.target.value);
              }}
            >
              {streams.map(function(stream) {
                return (
                  <option key={stream.id} value={stream.id}>{stream.name || stream.id}</option>
                );
              })}
            </Form.Select>
          </Form.Group>
        ) : null}
        <div className="small text-muted mb-1">Clients</div>
        {(group.clients || []).length === 0 ? (
          <p className="text-muted small mb-0">No clients in this group.</p>
        ) : (
          (group.clients || []).map(function(client) {
            return (
              <ClientVolumeSlider
                key={client.id}
                client={client}
                onChange={onClientVolume}
              />
            );
          })
        )}
      </Card.Body>
    </Card>
  );
}

export default function SnapcastPage({ mediaController, tunebook }) {
  const { status } = useMediaResolverHealth();
  const snapcastControl = useSnapcastControl(status);
  const snapcastPlayback = useSnapcastPlayback({
    mediaController: mediaController,
    snapcastControl: snapcastControl,
  });
  const snapcastEnabled = !!(mediaController.resolverFeatures && mediaController.resolverFeatures.snapcastControl);

  const handleConnect = useCallback(function() {
    snapcastControl.connect();
  }, [snapcastControl]);

  if (!snapcastEnabled) {
    return (
      <div className="p-3">
        <h1>Snapcast</h1>
        <Alert variant="warning">
          Snapcast is not enabled on your resolver. Start the snapcast compose profile and set SNAPCAST_ENABLED=true.
        </Alert>
      </div>
    );
  }

  return (
    <div className="snapcast-page p-3">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h1 className="mb-1">Snapcast</h1>
          <p className="text-muted mb-0">
            Manage groups, clients, and route Tune Book playback to your home speakers.
          </p>
        </div>
        <Link to="/settings" className="btn btn-sm btn-outline-secondary">Settings</Link>
      </div>

      {snapcastControl.connectError ? (
        <Alert variant="danger">{snapcastControl.connectError}</Alert>
      ) : null}

      <Row>
        <Col lg={7}>
          <Card className="mb-3">
            <Card.Body>
              <Card.Title className="h6">Connection</Card.Title>
              <p className="small text-muted mb-2">
                {snapcastControl.controlUrl
                  ? 'Control host: ' + snapcastControl.controlUrl
                  : 'Control URL not discovered — set an override in Settings.'}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                {!snapcastControl.connected ? (
                  <Button size="sm" variant="primary" onClick={handleConnect}>Connect</Button>
                ) : (
                  <Button size="sm" variant="outline-secondary" onClick={snapcastControl.disconnect}>
                    Disconnect
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>

          {snapcastControl.connected ? (
            <div>
              <h2 className="h5 mb-2">Groups</h2>
              {(snapcastControl.groups || []).map(function(group) {
                return (
                  <GroupCard
                    key={group.id}
                    group={group}
                    streams={snapcastControl.streams || []}
                    streamName={snapcastControl.streamName}
                    selected={snapcastControl.selectedGroupId === group.id}
                    onSelect={snapcastControl.setSelectedGroupId}
                    onSetStream={snapcastControl.setGroupStream}
                    onClientVolume={snapcastControl.setClientVolume}
                  />
                );
              })}
            </div>
          ) : null}
        </Col>

        <Col lg={5}>
          <Card>
            <Card.Body>
              <Card.Title className="h6">Tune Book routing</Card.Title>
              <p className="small text-muted">
                Play the current tune on the selected Snapcast group. Use the Output menu for quick access while practicing.
              </p>
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!snapcastControl.connected || !snapcastControl.selectedGroupId || snapcastPlayback.routing}
                  onClick={function() { snapcastPlayback.startRouting(); }}
                >
                  {icons.cast || '▶'} Play on Snapcast
                </Button>
                {snapcastPlayback.routing ? (
                  <Button size="sm" variant="warning" onClick={snapcastPlayback.stopRouting}>
                    Stop routing
                  </Button>
                ) : null}
              </div>
              {snapcastPlayback.routing ? (
                <p className="small text-success mt-2 mb-0">Routing session {snapcastPlayback.sessionId}</p>
              ) : null}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
