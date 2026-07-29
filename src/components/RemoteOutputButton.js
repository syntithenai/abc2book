import { useEffect } from 'react';
import { Button, Dropdown } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import useSnapcastControl from '../hooks/useSnapcastControl';
import useSnapcastPlayback from '../hooks/useSnapcastPlayback';
import useRemoteCastPlayback from '../useRemoteCastPlayback';
import useMediaCastSession from '../useMediaCastSession';
import OutputDevicePicker from './OutputDevicePicker';
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

export default function RemoteOutputButton({ mediaController, tunebook, compact, nowPlayingQueue, tunes }) {
  const snapcastControl = useSnapcastControl(mediaController.mediaResolverStatus);
  const snapcastPlayback = useSnapcastPlayback({
    mediaController: mediaController,
    snapcastControl: snapcastControl,
  });
  const airplayCast = useRemoteCastPlayback({ mediaController: mediaController });
  const castSession = useMediaCastSession({ mediaController: mediaController });

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
  const routingLabel = snapcastPlayback.routing
    ? 'Snapcast'
    : (castSession.connected ? 'Chromecast' : (airplayCast.connected ? 'AirPlay' : 'Output'));
  const outputQueue = buildRemoteOutputQueue(mediaController, nowPlayingQueue, tunes);
  const sessionPayload = buildRemotePlaybackSessionPayload(mediaController, tunebook, {
    queue: outputQueue,
    nowPlayingQueue: nowPlayingQueue,
    tunes: tunes,
  });

  useEffect(function() {
    if (!mediaController || !mediaController.setRemoteOutputHandlers) return undefined;
    mediaController.setRemoteOutputHandlers({
      seekRemote: function(seconds) {
        if (snapcastPlayback.sessionId) snapcastPlayback.seekRemote(seconds);
        else if (castSession.connected) castSession.castSeek(seconds);
      },
      pauseSnapcast: function() {
        import('../snapcastPlaybackClient').then(function(m) {
          m.postSnapcastPluginAction('pause').catch(function() {});
        });
      },
      resumeSnapcast: function() {
        import('../snapcastPlaybackClient').then(function(m) {
          m.postSnapcastPluginAction('play').catch(function() {});
        });
      },
      stopSnapcast: snapcastPlayback.stopRouting,
      pauseCast: castSession.castPause,
      resumeCast: castSession.castPlay,
      stopCast: castSession.stopCast,
      disconnectCast: airplayCast.disconnectCast,
    });
    return function() {
      mediaController.setRemoteOutputHandlers(null);
    };
  }, [
    airplayCast.disconnectCast,
    castSession.castPause,
    castSession.castPlay,
    castSession.castSeek,
    castSession.connected,
    castSession.stopCast,
    mediaController,
    snapcastPlayback.seekRemote,
    snapcastPlayback.sessionId,
    snapcastPlayback.stopRouting,
  ]);

  if (!snapcastEnabled && !castSdkEnabled && !airplayCast.isAirPlaySupported && !airplayCast.isRemotePlaybackSupported) {
    return null;
  }

  return (
    <Dropdown align="end" className="remote-output-button">
      <Dropdown.Toggle
        size={compact ? 'sm' : 'sm'}
        variant={remoteActive ? 'warning' : 'outline-secondary'}
        data-testid="media-controls-output-button"
        title="Remote output"
      >
        {tunebook.icons.cast || 'Output'}
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

          {castSdkEnabled ? (
            <div className="mb-3">
              <div className="fw-semibold small mb-1">Chromecast</div>
              {castReason ? <p className="text-muted small mb-1">{castReason}</p> : null}
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

          {snapcastEnabled ? (
            <div className="mb-3">
              <div className="fw-semibold small mb-1">Snapcast</div>
              {snapcastReason ? <p className="text-muted small mb-1">{snapcastReason}</p> : null}
              <div className="d-flex gap-2 flex-wrap mb-2">
                {!snapcastControl.connected ? (
                  <Button size="sm" variant="outline-primary" onClick={function() { snapcastControl.connect(); }}>
                    Connect
                  </Button>
                ) : null}
                {snapcastControl.connected && !snapcastPlayback.routing ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canSnapcast || !sessionPayload}
                    onClick={function() { snapcastPlayback.startRouting({ payload: sessionPayload }); }}
                  >
                    Play on Snapcast
                  </Button>
                ) : null}
                {snapcastPlayback.routing ? (
                  <Button size="sm" variant="warning" onClick={snapcastPlayback.stopRouting}>
                    Stop
                  </Button>
                ) : null}
              </div>
              <Link to="/snapcast" className="small">Open Snapcast home →</Link>
            </div>
          ) : null}

          <OutputDevicePicker
            mediaController={mediaController}
            disabled={!canAirPlay}
            disabledReason={airplayReason}
          />
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
