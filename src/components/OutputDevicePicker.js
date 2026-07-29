import { useCallback, useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import { getNativeAudioElement } from '../mediaCastSupport';

export function isSetSinkIdSupported() {
  if (typeof document === 'undefined') return false;
  const audio = document.createElement('audio');
  return typeof audio.setSinkId === 'function';
}

export default function OutputDevicePicker({ mediaController, disabled, disabledReason }) {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState(null);

  const refreshDevices = useCallback(async function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const outputs = list.filter(function(d) { return d.kind === 'audiooutput'; });
      setDevices(outputs);
    } catch (err) {
      setError(String(err.message || err));
    }
  }, []);

  useEffect(function() {
    refreshDevices();
  }, [refreshDevices]);

  const applySink = useCallback(async function(deviceId) {
    const el = getNativeAudioElement(mediaController);
    if (!el || typeof el.setSinkId !== 'function') return;
    setError(null);
    try {
      await el.setSinkId(deviceId || '');
      setSelectedId(deviceId || '');
    } catch (err) {
      setError(String(err.message || err));
    }
  }, [mediaController]);

  if (!isSetSinkIdSupported()) {
    return (
      <p className="text-muted small mb-0">Bluetooth / wired output picker is not supported in this browser.</p>
    );
  }

  return (
    <div className="output-device-picker">
      <Form.Label className="small mb-1">Local audio output</Form.Label>
      {disabled && disabledReason ? (
        <p className="text-muted small">{disabledReason}</p>
      ) : null}
      <Form.Select
        size="sm"
        value={selectedId}
        disabled={disabled}
        onChange={function(e) { applySink(e.target.value); }}
      >
        <option value="">Default output</option>
        {devices.map(function(device) {
          return (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || 'Speaker ' + device.deviceId.slice(0, 6)}
            </option>
          );
        })}
      </Form.Select>
      {error ? <p className="text-danger small mt-1 mb-0">{error}</p> : null}
    </div>
  );
}
