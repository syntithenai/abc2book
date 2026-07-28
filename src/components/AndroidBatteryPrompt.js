import { useEffect, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { isAndroidApp } from '../platformUtils';
import { openBatteryOptimizationSettings } from '../androidNativePlayback';

const STORAGE_KEY = 'tunebook_android_battery_prompt_dismissed';

export default function AndroidBatteryPrompt() {
  const [show, setShow] = useState(false);

  useEffect(function() {
    if (!isAndroidApp()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch (e) {
      return;
    }
    setShow(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {}
    setShow(false);
  }

  if (!isAndroidApp()) return null;

  return (
    <Modal show={show} onHide={dismiss} centered>
      <Modal.Header closeButton>
        <Modal.Title>Reliable background playback</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          For playback to continue when the screen is off, set Tunebook battery usage to
          <strong> Unrestricted</strong> in Android settings.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={dismiss}>
          Not now
        </Button>
        <Button
          variant="primary"
          onClick={function() {
            openBatteryOptimizationSettings().finally(dismiss);
          }}
        >
          Open battery settings
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
