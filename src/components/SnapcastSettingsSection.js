import { Button, Form } from 'react-bootstrap';
import { useCallback, useEffect, useState } from 'react';
import {
  getStoredSnapcastControlUrl,
  resolveSnapcastControlUrl,
  setStoredSnapcastControlUrl,
} from '../snapcastSupport';

export default function SnapcastSettingsSection({ mediaResolverStatus }) {
  const [url, setUrl] = useState(getStoredSnapcastControlUrl() || '');
  const resolved = resolveSnapcastControlUrl(mediaResolverStatus, url);
  const snapcast = mediaResolverStatus && mediaResolverStatus.snapcast
    ? mediaResolverStatus.snapcast
    : null;

  useEffect(function() {
    setUrl(getStoredSnapcastControlUrl() || '');
  }, [mediaResolverStatus]);

  const saveUrl = useCallback(function() {
    setStoredSnapcastControlUrl(url);
  }, [url]);

  return (
    <div className="snapcast-settings-section">
      <h3 className="h5">Snapcast</h3>
      <p className="text-muted small">
        Multi-room audio via snapserver. Enable with{' '}
        <code>docker compose --profile snapcast up</code> and set{' '}
        <code>SNAPCAST_ENABLED=true</code>.
      </p>
      {snapcast ? (
        <ul className="small text-muted">
          <li>Control: {snapcast.controlUrl || 'not discovered'}</li>
          <li>Reachable: {snapcast.reachable ? 'yes' : 'no'}</li>
          <li>Stream: {snapcast.streamName || '—'}</li>
          <li>TCP clients: {snapcast.tcpClients != null ? snapcast.tcpClients : '—'}</li>
        </ul>
      ) : (
        <p className="text-muted small">Snapcast status not available from resolver health.</p>
      )}
      <Form.Group className="mb-2">
        <Form.Label className="small">Control URL override</Form.Label>
        <div className="d-flex gap-2">
          <Form.Control
            size="sm"
            value={url}
            onChange={function(e) { setUrl(e.target.value); }}
            placeholder="http://192.168.1.10:1780"
          />
          <Button size="sm" variant="outline-primary" onClick={saveUrl}>Save</Button>
        </div>
        {resolved ? (
          <Form.Text className="text-muted">Using: {resolved}</Form.Text>
        ) : null}
      </Form.Group>
    </div>
  );
}
