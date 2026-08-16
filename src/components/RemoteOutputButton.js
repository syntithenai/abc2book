import { useState } from 'react';
import { Button, Dropdown, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useSnapcast, useCastSession, useAirplayCast } from '../RemoteOutputProvider';
import OutputDevicePicker, { isSetSinkIdSupported } from './OutputDevicePicker';
import SnapcastStatusBadge from './SnapcastStatusBadge';
import { castHttpOnHttpsPageWarning, resolveCastMediaBase } from '../castSupport';
import { snapcastMixedContentWarning } from '../snapcastSupport';
import {
  canCastNativeAudio,
  canRouteToCastSdk,
  canRouteToSnapcastPlayback,
  getCastSdkDisabledReason,
  getSnapcastDisabledReason,
  isRemoteOutputActive,
} from '../remoteOutputSupport';
import { buildRemoteOutputQueue } from '../remoteOutputQueue';
import { buildRemotePlaybackSessionPayload } from '../remotePlaybackSessionPayload';
import { isAndroidApp, isCastWebSdkSupported } from '../platformUtils';
import { isRemoteOutputUiEnabled } from '../remoteOutputUi';

export default function RemoteOutputButton({
  mediaController,
  tunebook,
  compact,
  largeIcon,
  nowPlayingQueue,
  tunes,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const castSession = useCastSession();
  const snapcast = useSnapcast();
  const airplayCast = useAirplayCast();

  if (!isRemoteOutputUiEnabled()) {
    return null;
  }

  const snapcastEnabled = !!(mediaController.resolverFeatures && mediaController.resolverFeatures.snapcastControl);
  const castSdkEnabled = !!(mediaController.resolverFeatures && (
    mediaController.resolverFeatures.castPlayback || mediaController.resolverFeatures.proxy
  ));
  const canSnapcast = canRouteToSnapcastPlayback(mediaController);
  const canChromecast = canRouteToCastSdk(mediaController);
  const canAirPlay = canCastNativeAudio(mediaController);
  const snapcastReason = getSnapcastDisabledReason(mediaController);
  const castReason = getCastSdkDisabledReason(mediaController);
  const airplayReason = airplayCast.disabledReason;
  const remoteActive = isRemoteOutputActive(mediaController.remoteOutputEngineRef);
  const routingLabel = snapcast.routing
    ? 'Snapcast'
    : (castSession.connected ? 'Chromecast' : (airplayCast.connected ? 'AirPlay' : 'Output'));
  const outputQueue = buildRemoteOutputQueue(mediaController, nowPlayingQueue, tunes);
  const sessionPayload = buildRemotePlaybackSessionPayload(mediaController, tunebook, {
    queue: outputQueue,
    nowPlayingQueue: nowPlayingQueue,
    tunes: tunes,
  });
  const castBase = resolveCastMediaBase({ healthStatus: mediaController.mediaResolverStatus });
  const castHttpWarning = castHttpOnHttpsPageWarning(castBase);
  const snapcastMixedWarning = snapcastMixedContentWarning(snapcast.controlUrl);

  const castWebSdkSupported = isCastWebSdkSupported();
  const showOutputMenu = isAndroidApp()
    || snapcastEnabled
    || castSdkEnabled
    || airplayCast.isAirPlaySupported
    || airplayCast.isRemotePlaybackSupported
    || isSetSinkIdSupported();

  if (!showOutputMenu) {
    return null;
  }

  const toggleClassName = 'remote-output-button-toggle'
    + (largeIcon ? ' remote-output-button-toggle--large-icon' : '');

  return (
    <Dropdown
      align="end"
      className={'remote-output-button' + (largeIcon ? ' remote-output-button--large-icon' : '')}
      show={menuOpen}
      onToggle={function(next) { setMenuOpen(!!next); }}
    >
      <Dropdown.Toggle
        size={compact ? 'sm' : 'sm'}
        variant={remoteActive ? 'warning' : 'outline-secondary'}
        className={toggleClassName}
        data-testid="media-controls-output-button"
        title="Remote output"
        aria-label="Remote output"
      >
        <span className="remote-output-button-icon">{tunebook.icons.cast || 'Output'}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ minWidth: compact ? '16rem' : '18rem' }}>
        <Dropdown.Header>{routingLabel}</Dropdown.Header>
        <div className="px-3 py-2">
          {(canAirPlay || airplayCast.isRemotePlaybackSupported) ? (
            <div className="mb-3">
              <div className="fw-semibold small mb-1">AirPlay / Remote Playback</div>
              {airplayReason ? <p className="text-muted small mb-1">{airplayReason}</p> : null}
              <Button
                size="sm"
                variant="outline-primary"
                disabled={!canAirPlay}
                onClick={function() { airplayCast.startCastHandoff(); }}
              >
                Hand off to TV / speaker
              </Button>
            </div>
          ) : null}

          {castSdkEnabled && castWebSdkSupported ? (
            <div className="mb-3">
              <div className="fw-semibold small mb-1">Chromecast</div>
              {castReason ? <p className="text-muted small mb-1">{castReason}</p> : null}
              {castHttpWarning ? <p className="text-warning small mb-1">{castHttpWarning}</p> : null}
              {castSession.joinable && !castSession.connected ? (
                <div className="mb-2">
                  <p className="text-muted small mb-1">
                    {castSession.storedCastTitle
                      ? 'Casting: ' + castSession.storedCastTitle
                      : 'Chromecast session active on your network'}
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={castSession.loading}
                    onClick={function() { castSession.joinCast(); }}
                  >
                    Control {castSession.deviceName || 'Chromecast'}
                  </Button>
                </div>
              ) : null}
              {!castSession.connected && !castSession.joinable ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canChromecast || castSession.loading || !sessionPayload}
                  data-testid="media-controls-cast-button"
                  onClick={function() { castSession.startCast({ payload: sessionPayload }); }}
                >
                  {castSession.loading ? 'Starting cast…' : 'Cast to Chromecast'}
                </Button>
              ) : null}
              {castSession.connected ? (
                <div className="d-flex gap-2 flex-wrap">
                  <Button size="sm" variant="warning" data-testid="media-controls-cast-stop" onClick={function() { castSession.stopCast(); }}>
                    Stop Cast ({castSession.deviceName || 'device'})
                  </Button>
                  <Button size="sm" variant="outline-secondary" onClick={function() { castSession.leaveCast(); }}>
                    Leave control
                  </Button>
                </div>
              ) : null}
              {castSession.error ? <p className="text-danger small mt-1 mb-0">{castSession.error}</p> : null}
            </div>
          ) : null}

          {castSdkEnabled && !castWebSdkSupported ? (
            <div className="mb-3">
              <div className="fw-semibold small mb-1">Chromecast</div>
              <p className="text-muted small mb-0">
                The Cast device picker is not available in the Android app. Use Snapcast below,
                pair Bluetooth speakers in Android Settings, or open <Link to="/now-playing">Now Playing</Link>.
              </p>
            </div>
          ) : null}

          {(snapcastEnabled || isAndroidApp()) ? (
            <div className="mb-3">
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="fw-semibold small">Snapcast</span>
                <SnapcastStatusBadge
                  snapcastEnabled={snapcastEnabled}
                  healthStatus={mediaController.mediaResolverStatus}
                  connected={snapcast.connected}
                  reconnecting={snapcast.reconnecting}
                  routing={snapcast.routing}
                  groups={snapcast.groups}
                />
              </div>
              {!snapcastEnabled ? (
                <p className="text-muted small mb-1">
                  Enable Snapcast on your home resolver, or set a control URL in{' '}
                  <Link to="/settings/providers">Settings → Providers</Link>.
                </p>
              ) : null}
              {snapcastReason ? <p className="text-muted small mb-1">{snapcastReason}</p> : null}
              {snapcastMixedWarning ? <p className="text-warning small mb-1">{snapcastMixedWarning}</p> : null}
              {snapcast.routingError ? <p className="text-danger small mb-1">{snapcast.routingError}</p> : null}
              {snapcast.connected && snapcast.groups.length > 1 ? (
                <Form.Group className="mb-2">
                  <Form.Label className="small mb-0">Target group</Form.Label>
                  <Form.Select
                    size="sm"
                    value={snapcast.selectedGroupId}
                    onChange={function(e) { snapcast.setSelectedGroupId(e.target.value); }}
                  >
                    {snapcast.groups.map(function(group) {
                      return (
                        <option key={group.id} value={group.id}>{group.name || group.id}</option>
                      );
                    })}
                  </Form.Select>
                </Form.Group>
              ) : null}
              <div className="d-flex gap-2 flex-wrap mb-2">
                {!snapcast.routing ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canSnapcast || !sessionPayload}
                    onClick={function() {
                      snapcast.startRoutingWithConnect({ payload: sessionPayload });
                    }}
                  >
                    {snapcast.connected ? 'Play on Snapcast' : 'Connect & play'}
                  </Button>
                ) : null}
                {snapcast.routing ? (
                  <Button size="sm" variant="warning" onClick={snapcast.stopRouting}>
                    Stop
                  </Button>
                ) : null}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <Link to="/snapcast" className="small align-self-center">Snapcast manager →</Link>
                <Link to="/now-playing" className="small align-self-center">Now Playing →</Link>
              </div>
            </div>
          ) : null}

          {!isAndroidApp() ? (
            <OutputDevicePicker
              mediaController={mediaController}
              menuOpen={menuOpen}
            />
          ) : (
            <p className="text-muted small mb-0">
              Bluetooth and wired outputs are chosen in Android system settings while Tunebook plays.
            </p>
          )}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
