import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

const VIDEO_CONSTRAINT_ATTEMPTS = [
  {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  {
    video: true,
    audio: false,
  },
];

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach(function(track) {
    track.stop();
  });
}

function guessCaptureFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return 'sheet-capture-' + stamp + '.jpg';
}

function cameraErrorMessage(error) {
  const name = error && error.name ? error.name : '';
  const message = error && error.message ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was blocked. Allow camera permission for this site in your browser settings.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /not found/i.test(message)) {
    return 'No camera was found. Connect a webcam, or use Choose image / PDF or Google Photos instead.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is in use by another app. Close other apps using the camera and try again.';
  }
  return message || 'Could not access the camera.';
}

async function openCameraStream(deviceId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera capture is not supported in this browser.');
  }

  if (deviceId) {
    return navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    });
  }

  let lastError = null;
  for (let i = 0; i < VIDEO_CONSTRAINT_ATTEMPTS.length; i += 1) {
    try {
      return await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINT_ATTEMPTS[i]);
    } catch (error) {
      lastError = error;
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        throw error;
      }
    }
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(function(device) {
    return device.kind === 'videoinput' && device.deviceId;
  });
  for (let j = 0; j < videoInputs.length; j += 1) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: videoInputs[j].deviceId } },
        audio: false,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No camera was found');
}

export default function SheetImageCameraModal(props) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState('');
  const [startCounter, setStartCounter] = useState(0);

  useEffect(function() {
    if (!props.show) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setReady(false);
      setCameraDevices([]);
      setActiveDeviceId('');
      return undefined;
    }

    let cancelled = false;
    setError('');
    setReady(false);

    openCameraStream(activeDeviceId || null).then(async function(stream) {
      if (cancelled) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      setReady(true);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCameraDevices(devices.filter(function(device) {
            return device.kind === 'videoinput' && device.deviceId;
          }));
        }
      } catch (e) {
        // Optional device list.
      }
    }).catch(function(e) {
      if (!cancelled) {
        setError(cameraErrorMessage(e));
        setReady(false);
      }
    });

    return function() {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      setReady(false);
    };
  }, [props.show, startCounter, activeDeviceId]);

  useEffect(function() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
  }, [ready, props.show]);

  function retryCamera() {
    setError('');
    setReady(false);
    setStartCounter(function(value) { return value + 1; });
  }

  function switchCamera() {
    if (cameraDevices.length < 2) return;
    const currentIndex = cameraDevices.findIndex(function(device) {
      return device.deviceId === activeDeviceId;
    });
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % cameraDevices.length;
    stopStream(streamRef.current);
    streamRef.current = null;
    setReady(false);
    setActiveDeviceId(cameraDevices[nextIndex].deviceId);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('Camera is not ready yet.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Could not capture the photo.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function(blob) {
      if (!blob) {
        setError('Could not capture the photo.');
        return;
      }
      const file = new File([blob], guessCaptureFilename(), { type: 'image/jpeg' });
      if (props.onCapture) props.onCapture(file);
      if (props.onHide) props.onHide();
    }, 'image/jpeg', 0.92);
  }

  return (
    <Modal show={props.show} onHide={function() {}} backdrop="static" keyboard={false} size="lg" centered>
      <Modal.Header>
        <Modal.Title>Capture sheet photo</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error ? (
          <Alert variant="danger">
            {error}
            <div className="mt-2">
              <Button variant="outline-danger" size="sm" onClick={retryCamera}>
                Try again
              </Button>
            </div>
          </Alert>
        ) : null}
        <div style={{ background: '#111', borderRadius: '0.5em', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', maxHeight: '60vh', display: 'block' }}
          />
        </div>
        <div className="small text-muted mt-2">
          Hold the page flat and fill the frame. Use good lighting and avoid glare.
        </div>
        {cameraDevices.length > 1 ? (
          <div className="mt-2">
            <Button variant="outline-secondary" size="sm" onClick={switchCamera} disabled={!ready}>
              Switch camera
            </Button>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" onClick={capturePhoto} disabled={!ready}>
          Capture photo
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
