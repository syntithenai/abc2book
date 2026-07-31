import { useState } from 'react';
import { Button, Dropdown, Form } from 'react-bootstrap';
import { useSnapcast, useCastSession, useAirplayCast } from '../RemoteOutputProvider';
import OutputDevicePicker, { isSetSinkIdSupported } from './OutputDevicePicker';
import {
  getChromecastOutputEnabled,
  getSnapcastOutputEnabled,
} from '../preferredRemoteOutputSettings';
import {
  canCastNativeAudio,
  canRouteToSnapcastPlayback,
  getCastSdkDisabledReason,
  isRemoteOutputActive,
} from '../remoteOutputSupport';
import { getRemoteOutputMenuSections } from '../remoteOutputMenuAccess';
import { buildRemoteOutputQueue } from '../remoteOutputQueue';
import { buildRemotePlaybackSessionPayload } from '../remotePlaybackSessionPayload';
import { isAndroidApp } from '../platformUtils';

export default function RemoteOutputButton({
  mediaController,
  tunebook,
  compact,
  largeIcon,
  nowPlayingQueue,
  tunes,
  login,
  accessToken,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const castSession = useCastSession();
  const snapcast = useSnapcast();
  const airplayCast = useAirplayCast();

  const snapcastOutputEnabled = getSnapcastOutputEnabled();
  const chromecastOutputEnabled = getChromecastOutputEnabled();
  const snapcastEnabled = snapcastOutputEnabled
    && !!(mediaController.resolverFeatures && mediaController.resolverFeatures.snapcastControl);
  const castSdkEnabled = chromecastOutputEnabled && !!(mediaController.resolverFeatures && (
    mediaController.resolverFeatures.castPlayback || mediaController.resolverFeatures.proxy
  ));
  const canSnapcast = canRouteToSnapcastPlayback(mediaController);
  const canAirPlay = canCastNativeAudio(mediaController);
  const castReason = getCastSdkDisabledReason(mediaController);
  const remoteActive = isRemoteOutputActive(mediaController.remoteOutputEngineRef);
  const outputQueue = buildRemoteOutputQueue(mediaController, nowPlayingQueue, tunes);
  const sessionPayload = buildRemotePlaybackSessionPayload(mediaController, tunebook, {
    queue: outputQueue,
    nowPlayingQueue: nowPlayingQueue,
    tunes: tunes,
  });

  const menu = getRemoteOutputMenuSections({
    mediaController: mediaController,
    accessToken: accessToken,
    snapcast: snapcast,
    castSession: castSession,
    airplayCast: airplayCast,
    canSnapcast: canSnapcast,
    canAirPlay: canAirPlay,
    castReason: castReason,
    castSdkEnabled: castSdkEnabled,
    snapcastEnabled: snapcastEnabled,
    sessionPayload: sessionPayload,
  });

  const outputActive = remoteActive || (snapcast.routing && snapcastEnabled);
  const toggleClassName = 'remote-output-button-toggle'
    + (largeIcon ? ' remote-output-button-toggle--large-icon' : '');

  if (!menu.showMenu) {
    return null;
  }

  function handleLoginClick() {
    if (typeof login === 'function') login();
  }

  return (
    <Dropdown
      align="end"
      className={'remote-output-button' + (largeIcon ? ' remote-output-button--large-icon' : '')}
      show={menuOpen}
      onToggle={function(next) { setMenuOpen(!!next); }}
    >
      <Dropdown.Toggle
        size={compact ? 'sm' : 'sm'}
        variant={outputActive ? 'primary' : 'outline-secondary'}
        className={toggleClassName}
        data-testid="media-controls-output-button"
        title="Audio output"
        aria-label="Audio output"
      >
        <span className="remote-output-button-icon">{tunebook.icons.cast || 'Output'}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="remote-output-menu" style={{ minWidth: compact ? '14rem' : '16rem' }}>
        {menu.activeLabel ? (
          <Dropdown.Header className="remote-output-menu-active">{menu.activeLabel}</Dropdown.Header>
        ) : null}

        {menu.showAirPlay ? (
          <div className="remote-output-menu-section px-3 py-2">
            {airplayCast.connected ? (
              <Button
                size="sm"
                variant="outline-danger"
                onClick={function() { airplayCast.disconnectCast(); }}
              >
                Stop AirPlay
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline-primary"
                disabled={!canAirPlay}
                onClick={function() { airplayCast.startCastHandoff(); }}
              >
                AirPlay / TV
              </Button>
            )}
          </div>
        ) : null}

        {menu.showChromecast ? (
          <div className="remote-output-menu-section px-3 py-2">
            {menu.chromecastLoginOnly ? (
              <Button size="sm" variant="primary" onClick={handleLoginClick}>
                Login to Chromecast
              </Button>
            ) : null}
            {!menu.chromecastLoginOnly && castSession.connected ? (
              <Button
                size="sm"
                variant="outline-danger"
                data-testid="media-controls-cast-stop"
                onClick={function() { castSession.stopCast(); }}
              >
                Stop Chromecast
              </Button>
            ) : null}
            {!menu.chromecastLoginOnly && castSession.joinable && !castSession.connected ? (
              <Button
                size="sm"
                variant="primary"
                disabled={castSession.loading}
                onClick={function() { castSession.joinCast(); }}
              >
                Control {castSession.deviceName || 'Chromecast'}
              </Button>
            ) : null}
            {!menu.chromecastLoginOnly && !castSession.connected && !castSession.joinable ? (
              <Button
                size="sm"
                variant="primary"
                disabled={!!castReason || castSession.loading || !sessionPayload}
                data-testid="media-controls-cast-button"
                onClick={function() { castSession.startCast({ payload: sessionPayload }); }}
              >
                {castSession.loading ? 'Starting…' : 'Chromecast'}
              </Button>
            ) : null}
            {castSession.error ? <p className="text-danger small mt-1 mb-0">{castSession.error}</p> : null}
          </div>
        ) : null}

        {menu.showSnapcast ? (
          <div className="remote-output-menu-section px-3 py-2">
            {menu.snapcastLoginOnly ? (
              <Button size="sm" variant="primary" onClick={handleLoginClick}>
                Login to Snapcast
              </Button>
            ) : null}
            {!menu.snapcastLoginOnly && snapcast.connected && snapcast.groups.length > 1 ? (
              <Form.Group className="mb-2">
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
            {!menu.snapcastLoginOnly && !snapcast.routing ? (
              <Button
                size="sm"
                variant="primary"
                disabled={!canSnapcast || !sessionPayload}
                onClick={function() {
                  snapcast.startRoutingWithConnect({ payload: sessionPayload });
                }}
              >
                {snapcast.connected ? 'Play on Snapcast' : 'Snapcast'}
              </Button>
            ) : null}
            {!menu.snapcastLoginOnly && snapcast.routing ? (
              <Button size="sm" variant="warning" onClick={snapcast.stopRouting}>
                Stop Snapcast
              </Button>
            ) : null}
            {snapcast.routingError ? <p className="text-danger small mt-1 mb-0">{snapcast.routingError}</p> : null}
          </div>
        ) : null}

        {menu.showLocalPicker ? (
          <div className="remote-output-menu-section px-3 py-2">
            <OutputDevicePicker
              mediaController={mediaController}
              menuOpen={menuOpen}
              minimal
            />
          </div>
        ) : null}
      </Dropdown.Menu>
    </Dropdown>
  );
}
