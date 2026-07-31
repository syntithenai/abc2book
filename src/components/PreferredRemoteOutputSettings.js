import { Form } from 'react-bootstrap';
import { useEffect, useState } from 'react';
import { isAndroidApp } from '../platformUtils';
import {
  getChromecastOutputEnabled,
  getSnapcastOutputEnabled,
  isRemoteOutputEnabled,
  setChromecastOutputEnabled,
  setRemoteOutputEnabled,
  setSnapcastOutputEnabled,
} from '../preferredRemoteOutputSettings';
import PreferredSnapcastOutputSettings from './PreferredSnapcastOutputSettings';

export default function PreferredRemoteOutputSettings({ mediaResolverStatus }) {
  const [remoteEnabled, setRemoteEnabledState] = useState(isRemoteOutputEnabled());
  const [snapcastEnabled, setSnapcastEnabledState] = useState(getSnapcastOutputEnabled());
  const [chromecastEnabled, setChromecastEnabledState] = useState(getChromecastOutputEnabled());

  useEffect(function() {
    function onChange() {
      setRemoteEnabledState(isRemoteOutputEnabled());
      setSnapcastEnabledState(getSnapcastOutputEnabled());
      setChromecastEnabledState(getChromecastOutputEnabled());
    }
    window.addEventListener('preferredRemoteOutputChanged', onChange);
    return function() {
      window.removeEventListener('preferredRemoteOutputChanged', onChange);
    };
  }, []);

  return (
    <div className="preferred-remote-output-settings">
      <Form.Check
        type="switch"
        id="remote-output-master"
        className="mb-3"
        label="Enable remote playback (Snapcast and Chromecast)"
        checked={remoteEnabled}
        onChange={function(e) {
          setRemoteOutputEnabled(e.target.checked);
          setRemoteEnabledState(e.target.checked);
          setSnapcastEnabledState(getSnapcastOutputEnabled());
          setChromecastEnabledState(getChromecastOutputEnabled());
        }}
      />
      <p className="text-muted small">
        Turn off to simplify playback — Play always uses this device and skips Snapcast routing,
        Chromecast, and related resolver sessions. AirPlay and local speaker pickers are unchanged.
      </p>

      {remoteEnabled ? (
        <div className="ms-2 border-start ps-3">
          <Form.Check
            type="switch"
            id="snapcast-output-enabled"
            className="mb-2"
            label="Snapcast multi-room output"
            checked={snapcastEnabled}
            onChange={function(e) {
              setSnapcastOutputEnabled(e.target.checked);
              setSnapcastEnabledState(e.target.checked);
              setRemoteEnabledState(isRemoteOutputEnabled());
            }}
          />
          {snapcastEnabled ? (
            <PreferredSnapcastOutputSettings mediaResolverStatus={mediaResolverStatus} />
          ) : (
            <p className="text-muted small mb-3">
              Snapcast controls are hidden while disabled. Re-enable to route Play to home speakers.
            </p>
          )}

          {!isAndroidApp() ? (
            <Form.Check
              type="switch"
              id="chromecast-output-enabled"
              className="mb-2"
              label="Chromecast output"
              checked={chromecastEnabled}
              onChange={function(e) {
                setChromecastOutputEnabled(e.target.checked);
                setChromecastEnabledState(e.target.checked);
                setRemoteEnabledState(isRemoteOutputEnabled());
              }}
            />
          ) : (
            <p className="text-muted small mb-0">
              Chromecast is not available in the Android app (disabled by default).
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
