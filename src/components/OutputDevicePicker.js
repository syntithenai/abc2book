import { useCallback, useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { getOutputDeviceId, setOutputDeviceId, OUTPUT_DEVICE_CHANGED_EVENT } from '../outputDeviceSettings';
import {
  applyOutputDeviceToMediaController,
  enumerateAudioOutputDevices,
  isSelectAudioOutputSupported,
  isSetSinkIdSupported,
  promptForAudioOutputDevice,
} from '../outputDeviceSupport';

export { isSetSinkIdSupported };

function deviceLabel(device) {
  if (device.label) return device.label;
  if (device.deviceId === 'default') return 'System default';
  return 'Speaker ' + device.deviceId.slice(0, 6);
}

export default function OutputDevicePicker({
  mediaController,
  disabled,
  disabledReason,
  menuOpen,
  minimal,
  inline,
}) {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(getOutputDeviceId);
  const [error, setError] = useState(null);
  const [pickingDevice, setPickingDevice] = useState(false);

  const refreshDevices = useCallback(async function() {
    try {
      const outputs = await enumerateAudioOutputDevices();
      setDevices(outputs);
    } catch (err) {
      setError(String(err.message || err));
    }
  }, []);

  useEffect(function() {
    refreshDevices();
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.addEventListener !== 'function') {
      return undefined;
    }
    const handleDeviceChange = function() {
      refreshDevices();
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return function() {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(function() {
    if (!menuOpen) return;
    refreshDevices();
  }, [menuOpen, refreshDevices]);

  useEffect(function() {
    function onOutputDeviceChanged() {
      setSelectedId(getOutputDeviceId());
    }
    window.addEventListener(OUTPUT_DEVICE_CHANGED_EVENT, onOutputDeviceChanged);
    return function() {
      window.removeEventListener(OUTPUT_DEVICE_CHANGED_EVENT, onOutputDeviceChanged);
    };
  }, []);

  const applySink = useCallback(async function(deviceId) {
    setError(null);
    try {
      if (mediaController && typeof mediaController.applyOutputDevice === 'function') {
        const result = await mediaController.applyOutputDevice(deviceId || '');
        const resolvedId = result && result.deviceId ? result.deviceId : getOutputDeviceId();
        setSelectedId(resolvedId);
        if (result && result.applied === 0 && resolvedId) {
          setError('Use Choose speaker… to allow this browser to route audio.');
        }
        return;
      }
      const nextId = setOutputDeviceId(deviceId || '');
      setSelectedId(nextId);
      const result = await applyOutputDeviceToMediaController(mediaController, nextId);
      if (result.applied === 0 && nextId) {
        setError('Use Choose speaker… to allow this browser to route audio.');
      }
    } catch (err) {
      if (err && err.name === 'NotAllowedError') {
        setError('Speaker access was denied. Use Choose speaker…');
        return;
      }
      setError(String(err.message || err));
    }
  }, [mediaController]);

  useEffect(function() {
    if (!menuOpen || !mediaController) return;
    applyOutputDeviceToMediaController(mediaController).catch(function() {});
  }, [menuOpen, mediaController]);

  const handleChooseDevice = useCallback(async function() {
    if (!isSelectAudioOutputSupported()) return;
    setPickingDevice(true);
    setError(null);
    try {
      const device = await promptForAudioOutputDevice({
        deviceId: selectedId || undefined,
      });
      await refreshDevices();
      await applySink(device.deviceId);
    } catch (err) {
      if (err && err.name === 'NotAllowedError') {
        return;
      }
      setError(String(err.message || err));
    } finally {
      setPickingDevice(false);
    }
  }, [applySink, refreshDevices, selectedId]);

  if (!isSetSinkIdSupported()) {
    return (
      <p className="text-muted small mb-0">Bluetooth / wired output picker is not supported in this browser.</p>
    );
  }

  const selectableDevices = devices.filter(function(device) {
    return device.deviceId && device.deviceId !== 'default';
  });
  const canChooseSpeaker = isSelectAudioOutputSupported();

  return (
    <div className={
      'output-device-picker'
      + (minimal ? ' output-device-picker--minimal' : '')
      + (inline ? ' output-device-picker--inline' : '')
    }>
      {minimal ? null : (
        <Form.Label className="small mb-1">Local audio output</Form.Label>
      )}
      {disabled && disabledReason ? (
        <p className="text-muted small">{disabledReason}</p>
      ) : null}
      <Form.Select
        size="sm"
        value={selectedId}
        disabled={disabled || pickingDevice}
        onChange={function(e) { applySink(e.target.value); }}
        aria-label={minimal ? 'Local audio output' : undefined}
      >
        <option value="">{minimal ? 'This device' : 'Default output'}</option>
        {devices.map(function(device) {
          if (device.deviceId === 'default') return null;
          return (
            <option key={device.deviceId} value={device.deviceId}>
              {deviceLabel(device)}
            </option>
          );
        })}
      </Form.Select>
      {canChooseSpeaker ? (
        <Button
          size="sm"
          variant="outline-secondary"
          className={inline ? '' : (minimal ? 'mt-1' : 'mt-2')}
          disabled={disabled || pickingDevice}
          onClick={handleChooseDevice}
        >
          {pickingDevice ? 'Opening…' : (minimal ? 'Choose speaker…' : 'Choose speaker…')}
        </Button>
      ) : null}
      {!minimal && selectableDevices.length === 0 && !canChooseSpeaker ? (
        <p className="text-muted small mt-1 mb-0">
          No speakers listed yet.
        </p>
      ) : null}
      {error ? <p className="text-danger small mt-1 mb-0">{error}</p> : null}
    </div>
  );
}
