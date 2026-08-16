import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Row } from 'react-bootstrap';
import { useSnapcast } from '../RemoteOutputProvider';
import {
  canRouteToSnapcastPlayback,
  getSnapcastDisabledReason,
} from '../remoteOutputSupport';
import { buildRemoteOutputQueue } from '../remoteOutputQueue';
import { buildRemotePlaybackSessionPayload } from '../remotePlaybackSessionPayload';
import SnapcastStatusBadge, { snapcastStatusSummary } from '../components/SnapcastStatusBadge';
import { icons } from '../Icons';
import { isSnapcastPreferredOutput } from '../preferredRemoteOutputSettings';

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

export default function SnapcastPage({ mediaController, tunebook, nowPlayingQueue, tunes }) {
  const snapcast = useSnapcast();
  const snapcastEnabled = !!(mediaController.resolverFeatures && mediaController.resolverFeatures.snapcastControl);
  const canSnapcast = canRouteToSnapcastPlayback(mediaController);
  const snapcastDefault = isSnapcastPreferredOutput();
  const snapcastReason = getSnapcastDisabledReason(mediaController);
  const outputQueue = buildRemoteOutputQueue(mediaController, nowPlayingQueue, tunes);
  const sessionPayload = useMemo(function() {
    return buildRemotePlaybackSessionPayload(mediaController, tunebook, {
      queue: outputQueue,
      nowPlayingQueue: nowPlayingQueue,
      tunes: tunes,
    });
  }, [mediaController, tunebook, outputQueue, nowPlayingQueue, tunes]);

  if (!snapcastEnabled) {
    return (
      <div className="snapcast-page p-3">
        <h1>Snapcast</h1>
        <Alert variant="warning">
          Snapcast is not enabled on your media resolver. If you run snapserver at home, set the
          control URL in <Link to="/settings/background-jobs">Settings → Background jobs</Link> (for example{' '}
          <code>http://192.168.1.10:1780</code>), then connect below.
        </Alert>
        <div className="mb-3">
          <Button size="sm" variant="primary" onClick={function() { snapcast.connect(); }}>Connect</Button>
          {snapcast.connectError ? (
            <Alert variant="danger" className="mt-2 mb-0">{snapcast.connectError}</Alert>
          ) : null}
        </div>
        <Link to="/settings/background-jobs" className="btn btn-sm btn-outline-secondary">Audio settings</Link>
      </div>
    );
  }

  return (
    <div className="snapcast-page p-3">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <h1 className="mb-0">Snapcast</h1>
            <SnapcastStatusBadge
              snapcastEnabled={snapcastEnabled}
              healthStatus={mediaController.mediaResolverStatus}
              connected={snapcast.connected}
              reconnecting={snapcast.reconnecting}
              routing={snapcast.routing}
              groups={snapcast.groups}
            />
          </div>
          <p className="text-muted mb-0">
            Manage groups, clients, and route Tune Book playback to your home speakers.
          </p>
        </div>
        <Link to="/settings/background-jobs" className="btn btn-sm btn-outline-secondary">Audio settings</Link>
      </div>

      {snapcast.connectError ? (
        <Alert variant="danger">{snapcast.connectError}</Alert>
      ) : null}
      {snapcast.routingError ? (
        <Alert variant="danger" className="mb-3">
          <strong>Snapcast routing failed.</strong> {snapcast.routingError}
        </Alert>
      ) : null}

      <Row>
        <Col lg={7}>
          <Card className="mb-3">
            <Card.Body>
              <Card.Title className="h6">Connection</Card.Title>
              <p className="small text-muted mb-2">
                {snapcast.controlUrl
                  ? 'Control host: ' + snapcast.controlUrl
                  : 'Control URL not discovered — set an override in Settings.'}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                {!snapcast.connected ? (
                  <Button size="sm" variant="primary" onClick={function() { snapcast.connect(); }}>Connect</Button>
                ) : (
                  <Button size="sm" variant="outline-secondary" onClick={function() { snapcast.disconnect(); }}>
                    Disconnect
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>

          {snapcast.connected ? (
            <div>
              <h2 className="h5 mb-2">Groups</h2>
              {(snapcast.groups || []).map(function(group) {
                return (
                  <GroupCard
                    key={group.id}
                    group={group}
                    streams={snapcast.streams || []}
                    streamName={snapcast.streamName}
                    selected={snapcast.selectedGroupId === group.id}
                    onSelect={snapcast.setSelectedGroupId}
                    onSetStream={snapcast.setGroupStream}
                    onClientVolume={snapcast.setClientVolume}
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
              {snapcast.routing ? (
                <p className="small text-success mb-2">
                  Routing to Snapcast — local playback is muted; audio should play on your speakers.
                </p>
              ) : snapcastDefault ? (
                <p className="small text-success mb-2">
                  Default output is Snapcast — pressing Play on eligible tunes routes to home speakers.
                </p>
              ) : (
                <p className="small text-muted mb-2">
                  Normal Play uses this device. Enable default Snapcast in Settings → Audio, or press Play on Snapcast below.
                </p>
              )}
              {snapcastReason ? <p className="text-muted small">{snapcastReason}</p> : null}
              <p className="small text-muted">
                {snapcastStatusSummary(mediaController.mediaResolverStatus, snapcast.groups, {
                  routing: snapcast.routing,
                })}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={
                    !canSnapcast
                    || !sessionPayload
                    || snapcast.routing
                  }
                  onClick={function() {
                    snapcast.startRoutingWithConnect({ payload: sessionPayload });
                  }}
                >
                  {icons.cast || '▶'} {snapcast.connected ? 'Play on Snapcast' : 'Connect & play'}
                </Button>
                {snapcast.routing ? (
                  <Button size="sm" variant="warning" onClick={snapcast.stopRouting}>
                    Stop routing
                  </Button>
                ) : null}
              </div>
              {snapcast.routing ? (
                <p className="small text-success mt-2 mb-0">Routing session {snapcast.sessionId}</p>
              ) : null}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
