import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isAndroidApp, isCapacitorNative, isMobilePlatform } from '../platformUtils';

const VIDEO_CONSTRAINT_ATTEMPTS = [
  {
    video: {
      facingMode: { ideal: 'environment' },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: 'user' },
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

function preferNativeCameraUi() {
  return isAndroidApp() || isCapacitorNative() || isMobilePlatform();
}

function isNoCameraError(error) {
  const name = error && error.name ? error.name : '';
  const message = error && error.message ? String(error.message) : '';
  return name === 'NotFoundError'
    || name === 'DevicesNotFoundError'
    || name === 'OverconstrainedError'
    || /not found|no camera|no device/i.test(message);
}

function cameraErrorMessage(error) {
  const name = error && error.name ? error.name : '';
  const message = error && error.message ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return isAndroidApp()
      ? 'Camera access was blocked. Allow camera permission for Tunebook in Android Settings.'
      : 'Camera access was blocked. Allow camera permission for this site in your browser settings.';
  }
  if (isNoCameraError(error)) {
    return 'No live webcam was available. Use Take photo to open your device camera, or pick images instead.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is in use by another app. Close other apps using the camera and try again.';
  }
  if (name === 'SecurityError' || /secure context|https/i.test(message)) {
    return 'Camera needs a secure connection (https or localhost). Use Take photo or pick images instead.';
  }
  return message || 'Could not access the camera.';
}

async function openCameraStream(deviceId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Camera capture is not supported in this browser.'), {
      name: 'NotFoundError',
    });
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

  try {
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
  } catch (e) {
    lastError = lastError || e;
  }

  throw lastError || Object.assign(new Error('No camera was found'), { name: 'NotFoundError' });
}

async function capturePhotoWithCapacitorCamera() {
  const permission = await Camera.requestPermissions({ permissions: ['camera'] });
  if (!permission || permission.camera === 'denied') {
    throw Object.assign(new Error('Camera permission denied'), { name: 'NotAllowedError' });
  }
  const photo = await Camera.getPhoto({
    quality: 90,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
  });
  const webPath = photo.webPath || photo.path;
  if (!webPath) {
    throw new Error('Could not capture the photo.');
  }
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error('Could not read captured photo.');
  }
  const blob = await response.blob();
  return new File([blob], guessCaptureFilename(), { type: blob.type || 'image/jpeg' });
}

function normalizePickedFiles(fileList) {
  return Array.from(fileList || []).filter(function(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) return true;
    return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '');
  });
}

/**
 * Sheet photo capture.
 * - Desktop: live webcam preview when available
 * - Mobile / Capacitor / no-webcam: native camera via Capacitor or <input capture>
 * - multiCapture: keep gathering photos until Done
 */
export default function SheetImageCameraModal(props) {
  const multiCapture = !!props.multiCapture;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState('');
  const [startCounter, setStartCounter] = useState(0);
  const [nativeMode, setNativeMode] = useState(preferNativeCameraUi());
  const [rollCount, setRollCount] = useState(0);

  useEffect(function() {
    if (!props.show) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setReady(false);
      setCameraDevices([]);
      setActiveDeviceId('');
      setNativeMode(preferNativeCameraUi());
      setRollCount(0);
      setError('');
      return undefined;
    }

    if (preferNativeCameraUi()) {
      setNativeMode(true);
      setReady(true);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setError('');
    setReady(false);
    setNativeMode(false);

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
      if (cancelled) return;
      // Fall back to native / file capture instead of a dead-end error.
      if (isNoCameraError(e) || e.name === 'SecurityError') {
        setNativeMode(true);
        setReady(true);
        setError('');
        return;
      }
      setError(cameraErrorMessage(e));
      setReady(false);
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
  }, [ready, props.show, nativeMode]);

  function retryCamera() {
    setError('');
    setReady(false);
    setNativeMode(preferNativeCameraUi());
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

  function finishCapture(file) {
    if (props.onCapture) props.onCapture(file);
    if (multiCapture) {
      setRollCount(function(n) { return n + 1; });
      return;
    }
    if (props.onHide) props.onHide();
  }

  function finishCaptureFiles(files) {
    const list = normalizePickedFiles(files);
    if (!list.length) {
      setError('No image was selected.');
      return;
    }
    list.forEach(function(file) {
      finishCapture(file);
    });
  }

  function doneRoll() {
    if (typeof props.onDone === 'function') props.onDone(rollCount);
    if (props.onHide) props.onHide();
  }

  function openNativeCaptureInput() {
    if (captureInputRef.current) captureInputRef.current.click();
  }

  function capturePhoto() {
    if (nativeMode) {
      setError('');
      if (isCapacitorNative() || isAndroidApp()) {
        capturePhotoWithCapacitorCamera().then(function(file) {
          finishCapture(file);
        }).catch(function(e) {
          // Capacitor failed — fall through to HTML capture input.
          if (isNoCameraError(e) || e.name === 'NotImplementedError') {
            openNativeCaptureInput();
            return;
          }
          setError(cameraErrorMessage(e));
        });
        return;
      }
      openNativeCaptureInput();
      return;
    }
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
      finishCapture(file);
    }, 'image/jpeg', 0.92);
  }

  return (
    <Modal show={props.show} onHide={function() {}} backdrop="static" keyboard={false} size="lg" centered>
      <Modal.Header>
        <Modal.Title>
          {multiCapture ? 'Capture sheet photos' : 'Capture sheet photo'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple={multiCapture}
          style={{ display: 'none' }}
          data-testid="sheet-camera-native-input"
          onChange={function(event) {
            finishCaptureFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple={multiCapture}
          style={{ display: 'none' }}
          data-testid="sheet-camera-gallery-input"
          onChange={function(event) {
            finishCaptureFiles(event.target.files);
            event.target.value = '';
          }}
        />
        {error ? (
          <Alert variant="danger">
            {error}
            <div className="mt-2 d-flex flex-wrap gap-2">
              <Button variant="outline-danger" size="sm" onClick={retryCamera}>
                Try again
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={function() {
                  setError('');
                  setNativeMode(true);
                  setReady(true);
                }}
              >
                Use device camera
              </Button>
            </div>
          </Alert>
        ) : null}
        {multiCapture ? (
          <div className="small mb-2" data-testid="sheet-camera-roll-count">
            {rollCount === 0
              ? 'Take as many photos as you need, then tap Done.'
              : (rollCount + ' photo' + (rollCount === 1 ? '' : 's') + ' in this roll')}
          </div>
        ) : null}
        {nativeMode ? (
          <div className="text-center py-4">
            <p className="mb-3">
              {multiCapture
                ? 'Open your device camera for each shot (or pick several images). Keep going until you tap Done.'
                : 'Open your device camera to capture a sheet photo.'}
            </p>
            <Button variant="primary" onClick={capturePhoto} data-testid="sheet-camera-native-open">
              {multiCapture && rollCount > 0 ? 'Take another photo' : 'Take photo'}
            </Button>
            <div className="mt-2">
              <Button
                variant="link"
                size="sm"
                onClick={function() {
                  if (galleryInputRef.current) galleryInputRef.current.click();
                }}
              >
                Choose from gallery
              </Button>
            </div>
          </div>
        ) : (
        <div style={{ background: '#111', borderRadius: '0.5em', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', maxHeight: '60vh', display: 'block' }}
          />
        </div>
        )}
        {!nativeMode ? (
        <div className="small text-muted mt-2">
          Hold the page flat and fill the frame. Use good lighting and avoid glare.
          {multiCapture ? ' Capture repeatedly — the camera stays open until you tap Done.' : ''}
        </div>
        ) : null}
        {!nativeMode && cameraDevices.length > 1 ? (
          <div className="mt-2">
            <Button variant="outline-secondary" size="sm" onClick={switchCamera} disabled={!ready}>
              Switch camera
            </Button>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        {multiCapture ? (
          <>
            <Button variant="outline-secondary" onClick={doneRoll}>
              {rollCount > 0 ? 'Done' : 'Cancel'}
            </Button>
            {!nativeMode ? (
              <Button variant="primary" onClick={capturePhoto} disabled={!ready}>
                Capture photo
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button variant="outline-secondary" onClick={props.onHide}>Cancel</Button>
            {!nativeMode ? (
            <Button variant="primary" onClick={capturePhoto} disabled={!ready}>
              Capture photo
            </Button>
            ) : null}
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
