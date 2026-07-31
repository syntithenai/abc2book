import { Button, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { isAndroidApp } from '../platformUtils';
import { openBatteryOptimizationSettings } from '../androidNativePlayback';
import {
  getPlaybackVolume,
  setPlaybackVolume,
  PLAYBACK_VOLUME_MAX,
  PLAYBACK_VOLUME_MIN,
  PLAYBACK_VOLUME_STEP,
} from '../playbackVolumeSettings';
import SnapcastSettingsSection from './SnapcastSettingsSection';
import PreferredRemoteOutputSettings from './PreferredRemoteOutputSettings';
import OutputDevicePicker from './OutputDevicePicker';

export default function AudioSettingsSection({ mediaController, mediaResolverStatus }) {
  const [defaultVolume, setDefaultVolume] = useState(getPlaybackVolume());

  useEffect(function() {
    setDefaultVolume(getPlaybackVolume());
  }, []);

  function handleDefaultVolumeChange(event) {
    const next = setPlaybackVolume(event.target.value);
    setDefaultVolume(next);
    if (mediaController && mediaController.setPlaybackVolume) {
      mediaController.setPlaybackVolume(next);
    } else if (mediaController && mediaController.applyPlaybackVolumeRef
      && mediaController.applyPlaybackVolumeRef.current) {
      mediaController.applyPlaybackVolumeRef.current(next);
    }
  }

  return (
    <div className="audio-settings-section">
      <div className="app-surface-panel App-settings-section">
        <h2>Playback defaults</h2>
        <p className="app-text-muted">
          Default volume applies when you open the app and when playback starts on a new tune.
        </p>
        <Form.Group controlId="settings-default-playback-volume" style={{ maxWidth: '20rem' }}>
          <Form.Label>Default playback volume</Form.Label>
          <div className="d-flex align-items-center gap-2">
            <Form.Range
              min={PLAYBACK_VOLUME_MIN}
              max={PLAYBACK_VOLUME_MAX}
              step={PLAYBACK_VOLUME_STEP}
              value={defaultVolume}
              onChange={handleDefaultVolumeChange}
            />
            <span className="small text-muted" style={{ minWidth: '3rem' }}>
              {Math.round(defaultVolume * 100)}%
            </span>
          </div>
        </Form.Group>
      </div>

      <div className="app-surface-panel App-settings-section">
        <h2>Local audio output</h2>
        {isAndroidApp() ? (
          <>
            <p className="app-text-muted">
              Tunebook plays through the Android audio system (ExoPlayer). Pair Bluetooth speakers,
              headphones, or hearing aids in <strong>Android Settings → Connected devices</strong>,
              then select them as the system output while Tunebook is playing.
            </p>
            <p className="app-text-muted mb-2">
              For reliable background playback with the screen off, set Tunebook battery use to
              <strong> Unrestricted</strong> in Android app settings.
            </p>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={function() { openBatteryOptimizationSettings().catch(function() {}); }}
            >
              Open battery settings
            </Button>
          </>
        ) : (
          <>
            <p className="app-text-muted mb-2">
              Choose which speaker or headphone output the browser uses for linked audio playback.
            </p>
            <OutputDevicePicker mediaController={mediaController} />
          </>
        )}
      </div>

      <div className="app-surface-panel App-settings-section">
        <h2>Remote playback</h2>
        <p className="app-text-muted">
          Optional whole-home audio via Snapcast or Chromecast. Disable here if you only play on this device.
        </p>
        <PreferredRemoteOutputSettings mediaResolverStatus={mediaResolverStatus} />
      </div>

      <div className="app-surface-panel App-settings-section">
        <h2>Snapcast multi-room</h2>
        <p className="app-text-muted">
          Advanced Snapcast controls and connection manager. Default output is configured under Remote playback above.
        </p>
        <div className="App-settings-actions mb-3">
          <Button as={Link} to="/snapcast" variant="primary">
            Open Snapcast manager
          </Button>
        </div>
        <SnapcastSettingsSection mediaResolverStatus={mediaResolverStatus} nested />
      </div>

      {isAndroidApp() ? (
        <div className="app-surface-panel App-settings-section">
          <h2>Chromecast</h2>
          <p className="app-text-muted mb-0">
            The Google Cast device picker only works in desktop Chrome, not inside the Android app.
            Use <Link to="/snapcast">Snapcast</Link> for whole-home audio, or cast from YouTube&apos;s
            own app if you need video on a TV.
          </p>
        </div>
      ) : null}
    </div>
  );
}
