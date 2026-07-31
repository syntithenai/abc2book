import { Button, Form, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  getPreferredRemoteOutput,
  getSnapcastAutoConnect,
  getSnapcastFallbackToLocal,
  getSnapcastYoutubeAcknowledged,
  PREFERRED_OUTPUT_LOCAL,
  PREFERRED_OUTPUT_SNAPCAST,
  setPreferredRemoteOutput,
  setSnapcastAutoConnect,
  setSnapcastFallbackToLocal,
  setSnapcastYoutubeAcknowledged,
} from '../preferredRemoteOutputSettings';
import { useSnapcast } from '../RemoteOutputProvider';
import { hasHomeSnapcastPlayback } from '../preferredOutputCoordinator';

const YOUTUBE_DISCLAIMER = (
  <>
    <p>
      Snapcast routes audio through your home resolver, including YouTube links when enabled.
      That path downloads and re-streams audio to your speakers — not the official YouTube player.
    </p>
    <p className="mb-0">
      By enabling default Snapcast output, you confirm you have the right to play the linked media
      and accept responsibility for complying with applicable terms of service.
    </p>
  </>
);

export default function PreferredSnapcastOutputSettings({ mediaResolverStatus }) {
  const snapcast = useSnapcast();
  const [preferredOutput, setPreferredOutputState] = useState(getPreferredRemoteOutput());
  const [autoConnect, setAutoConnectState] = useState(getSnapcastAutoConnect());
  const [fallbackLocal, setFallbackLocalState] = useState(getSnapcastFallbackToLocal());
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [pendingSnapcast, setPendingSnapcast] = useState(false);
  const homeResolver = hasHomeSnapcastPlayback(mediaResolverStatus);

  useEffect(function() {
    function onChange() {
      setPreferredOutputState(getPreferredRemoteOutput());
      setAutoConnectState(getSnapcastAutoConnect());
      setFallbackLocalState(getSnapcastFallbackToLocal());
    }
    window.addEventListener('preferredRemoteOutputChanged', onChange);
    return function() {
      window.removeEventListener('preferredRemoteOutputChanged', onChange);
    };
  }, []);

  const applySnapcastDefault = useCallback(function() {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
    setPreferredOutputState(PREFERRED_OUTPUT_SNAPCAST);
    setPendingSnapcast(false);
    setShowDisclaimer(false);
  }, []);

  const handleOutputChange = useCallback(function(value) {
    if (value === PREFERRED_OUTPUT_SNAPCAST) {
      if (!getSnapcastYoutubeAcknowledged()) {
        setPendingSnapcast(true);
        setShowDisclaimer(true);
        return;
      }
      applySnapcastDefault();
      return;
    }
    setPreferredRemoteOutput(PREFERRED_OUTPUT_LOCAL);
    setPreferredOutputState(PREFERRED_OUTPUT_LOCAL);
  }, [applySnapcastDefault]);

  const acceptDisclaimer = useCallback(function() {
    setSnapcastYoutubeAcknowledged(true);
    applySnapcastDefault();
  }, [applySnapcastDefault]);

  const cancelDisclaimer = useCallback(function() {
    setShowDisclaimer(false);
    setPendingSnapcast(false);
  }, []);

  return (
    <div className="preferred-snapcast-output-settings mb-3">
      <Form.Label className="fw-semibold small">Default output</Form.Label>
      <p className="text-muted small mb-2">
        When Snapcast is the default, Play sends eligible tunes to your home speakers via the
        peppertrees resolver. Ineligible tunes play on this device.
      </p>
      {!homeResolver ? (
        <p className="text-warning small">
          Default Snapcast requires your home resolver with snapcast playback enabled (not cloud light).
        </p>
      ) : null}
      <Form.Check
        type="radio"
        id="preferred-output-local"
        name="preferred-output"
        label="This device"
        checked={preferredOutput === PREFERRED_OUTPUT_LOCAL}
        onChange={function() { handleOutputChange(PREFERRED_OUTPUT_LOCAL); }}
      />
      <Form.Check
        type="radio"
        id="preferred-output-snapcast"
        name="preferred-output"
        label="Snapcast (home speakers)"
        checked={preferredOutput === PREFERRED_OUTPUT_SNAPCAST}
        onChange={function() { handleOutputChange(PREFERRED_OUTPUT_SNAPCAST); }}
        className="mb-2"
      />

      {preferredOutput === PREFERRED_OUTPUT_SNAPCAST ? (
        <div className="ms-3 border-start ps-3 mb-2">
          {snapcast.connected && snapcast.groups.length > 0 ? (
            <Form.Group className="mb-2">
              <Form.Label className="small mb-0">Default Snapcast group</Form.Label>
              <Form.Select
                size="sm"
                value={snapcast.selectedGroupId || ''}
                onChange={function(e) { snapcast.setSelectedGroupId(e.target.value); }}
              >
                {snapcast.groups.map(function(group) {
                  return (
                    <option key={group.id} value={group.id}>{group.name || group.id}</option>
                  );
                })}
              </Form.Select>
            </Form.Group>
          ) : (
            <p className="text-muted small mb-2">
              Connect on the <Link to="/snapcast">Snapcast manager</Link> page to pick a group.
            </p>
          )}
          <Form.Check
            type="checkbox"
            id="snapcast-auto-connect"
            label="Connect to Snapcast automatically when playing"
            checked={autoConnect}
            onChange={function(e) {
              setSnapcastAutoConnect(e.target.checked);
              setAutoConnectState(e.target.checked);
            }}
            className="small mb-1"
          />
          <Form.Check
            type="checkbox"
            id="snapcast-fallback-local"
            label="Fall back to this device if Snapcast routing fails"
            checked={fallbackLocal}
            onChange={function(e) {
              setSnapcastFallbackToLocal(e.target.checked);
              setFallbackLocalState(e.target.checked);
            }}
            className="small"
          />
        </div>
      ) : null}

      <Modal show={showDisclaimer && pendingSnapcast} onHide={cancelDisclaimer} centered>
        <Modal.Header closeButton>
          <Modal.Title>YouTube and linked media</Modal.Title>
        </Modal.Header>
        <Modal.Body>{YOUTUBE_DISCLAIMER}</Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={cancelDisclaimer}>Cancel</Button>
          <Button variant="primary" onClick={acceptDisclaimer}>I understand — use Snapcast</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
