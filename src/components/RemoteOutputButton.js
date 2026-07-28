import { Button, Dropdown, Form } from 'react-bootstrap';
import useSnapcastSession from '../useSnapcastSession';
import { canRouteToSnapcastPlayback, getSnapcastDisabledReason } from '../remoteOutputSupport';

function SnapcastPanel({ snapcastSession }) {
  const groups = snapcastSession.groups || [];
  return (
    <div className="snapcast-control-panel">
      <p className="text-muted small mb-2">
        {snapcastSession.controlUrl
          ? 'Snapcast host: ' + snapcastSession.controlUrl
          : 'Snapcast host not discovered — connect manually or enable compose profile snapcast'}
      </p>
      {snapcastSession.connectError ? (
        <p className="text-danger small">{snapcastSession.connectError}</p>
      ) : null}
      <div className="d-flex gap-2 mb-2 flex-wrap">
        {!snapcastSession.connected ? (
          <Button size="sm" variant="outline-primary" onClick={function() { snapcastSession.connect(); }}>
            Connect
          </Button>
        ) : (
          <Button size="sm" variant="outline-secondary" onClick={snapcastSession.disconnect}>
            Disconnect
          </Button>
        )}
        {snapcastSession.connected && !snapcastSession.routing ? (
          <Button size="sm" variant="primary" onClick={snapcastSession.startRouting}>
            Play on Snapcast
          </Button>
        ) : null}
        {snapcastSession.routing ? (
          <Button size="sm" variant="warning" onClick={snapcastSession.stopRouting}>
            Stop Snapcast
          </Button>
        ) : null}
      </div>
      {snapcastSession.connected && groups.length > 0 ? (
        <Form.Group className="mb-2">
          <Form.Label className="small mb-1">Target group</Form.Label>
          <Form.Select
            size="sm"
            value={snapcastSession.selectedGroupId}
            onChange={function(e) { snapcastSession.setSelectedGroupId(e.target.value); }}
          >
            {groups.map(function(group) {
              return (
                <option key={group.id} value={group.id}>
                  {group.name || group.id}
                </option>
              );
            })}
          </Form.Select>
        </Form.Group>
      ) : null}
      {snapcastSession.connected && groups.length > 0 ? (
        <div className="snapcast-client-list small">
          {groups.map(function(group) {
            return (
              <div key={group.id} className="mb-2">
                <strong>{group.name || group.id}</strong>
                <ul className="mb-0 ps-3">
                  {(group.clients || []).map(function(client) {
                    const config = client.config || {};
                    const volume = config.volume || {};
                    return (
                      <li key={client.id}>
                        {client.host && client.host.name ? client.host.name : client.id}
                        {' — '}
                        {volume.percent != null ? volume.percent + '%' : '—'}
                        {volume.muted ? ' (muted)' : ''}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function RemoteOutputButton({ mediaController, tunebook }) {
  const snapcastSession = useSnapcastSession({
    mediaController: mediaController,
    mediaResolverStatus: mediaController.mediaResolverStatus,
  });
  const snapcastEnabled = !!(mediaController.resolverFeatures && mediaController.resolverFeatures.snapcastControl);
  const canPlay = canRouteToSnapcastPlayback(mediaController);
  const disabledReason = getSnapcastDisabledReason(mediaController);
  const routingLabel = snapcastSession.routing ? 'Routing to Snapcast' : 'Snapcast';

  if (!snapcastEnabled) {
    return null;
  }

  return (
    <Dropdown align="end" className="remote-output-button">
      <Dropdown.Toggle
        size="sm"
        variant={snapcastSession.routing ? 'warning' : 'outline-secondary'}
        data-testid="media-controls-output-button"
        title={disabledReason || 'Remote output'}
      >
        {tunebook.icons.cast || 'Output'}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Header>Remote output</Dropdown.Header>
        <div className="px-3 py-2" style={{ minWidth: '18rem' }}>
          <div className="fw-semibold mb-1">{routingLabel}</div>
          {!canPlay && disabledReason ? (
            <p className="text-muted small">{disabledReason}</p>
          ) : null}
          <SnapcastPanel snapcastSession={snapcastSession} />
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
