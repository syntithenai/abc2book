import { Button, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  getStoredSnapcastControlUrl,
  resolveSnapcastControlUrl,
  setStoredSnapcastControlUrl,
} from '../snapcastSupport';
import { resolveCastMediaBase, castHttpOnHttpsPageWarning } from '../castSupport';
import { snapcastMixedContentWarning } from '../snapcastSupport';
import SnapcastStatusBadge, { snapcastStatusSummary } from './SnapcastStatusBadge';

export default function SnapcastSettingsSection({ mediaResolverStatus, nested }) {
  const [url, setUrl] = useState(getStoredSnapcastControlUrl() || '');
  const resolved = resolveSnapcastControlUrl(mediaResolverStatus, url);
  const snapcast = mediaResolverStatus && mediaResolverStatus.snapcast
    ? mediaResolverStatus.snapcast
    : null;
  const cast = mediaResolverStatus && mediaResolverStatus.cast
    ? mediaResolverStatus.cast
    : null;
  const castBase = resolveCastMediaBase({ healthStatus: mediaResolverStatus });
  const castHttpWarning = castHttpOnHttpsPageWarning(castBase);
  const snapcastMixedWarning = snapcastMixedContentWarning(resolved);

  useEffect(function() {
    setUrl(getStoredSnapcastControlUrl() || '');
  }, [mediaResolverStatus]);

  const saveUrl = useCallback(function() {
    setStoredSnapcastControlUrl(url);
  }, [url]);

  return (
    <div className="snapcast-settings-section">
      {!nested ? (
        <>
          <h3 className="h5">Remote output</h3>
          <p className="text-muted small mb-3">
            Chromecast uses the media resolver below. Snapcast needs{' '}
            <code>docker compose --profile snapcast up</code> on your home resolver.
          </p>
        </>
      ) : null}

      {!nested ? (
        <>
          <h4 className="h6">Chromecast</h4>
          {cast ? (
            <ul className="small text-muted">
              <li>HLS enabled: {cast.enabled ? 'yes' : 'no'}</li>
              <li>Media base: {cast.publicBase || castBase || 'not discovered'}</li>
            </ul>
          ) : (
            <p className="text-muted small">Cast status not available from resolver health.</p>
          )}
        </>
      ) : null}

      {!nested ? <h4 className="h6 mt-3">Snapcast</h4> : null}
      <div className="mb-2">
        <SnapcastStatusBadge
          snapcastEnabled={!!(snapcast && snapcast.enabled)}
          healthStatus={mediaResolverStatus}
          connected={false}
          reconnecting={false}
          routing={false}
          groups={[]}
        />
      </div>
      <p className="text-muted small">
        {snapcast ? snapcastStatusSummary(mediaResolverStatus, []) : 'Enable with SNAPCAST_ENABLED=true in the resolver .env.'}
      </p>
      {castHttpWarning ? <p className="text-warning small">{castHttpWarning}</p> : null}
      {snapcastMixedWarning ? <p className="text-warning small">{snapcastMixedWarning}</p> : null}
      {snapcast ? (
        <ul className="small text-muted">
          <li>Control: {snapcast.controlUrl || 'not discovered'}</li>
          {snapcast.controlUrlLan ? <li>LAN control: {snapcast.controlUrlLan}</li> : null}
          <li>Reachable: {snapcast.reachable ? 'yes' : 'no'}</li>
          <li>Stream: {snapcast.streamName || '—'}</li>
          <li>PCM link: {snapcast.pcmLinked ? 'yes' : 'no'}</li>
          {snapcast.localClient ? (
            <li>
              Host speaker: {snapcast.localClient.enabled
                ? (snapcast.localClient.hostname || 'resolver-host')
                : 'disabled'}
            </li>
          ) : null}
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
