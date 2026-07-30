import { getOutputDeviceId } from './outputDeviceSettings';

export function isSetSinkIdSupported() {
  if (typeof document === 'undefined') return false;
  const audio = document.createElement('audio');
  return typeof audio.setSinkId === 'function';
}

export function isAudioContextSetSinkIdSupported() {
  if (typeof window === 'undefined') return false;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !Ctx.prototype) return false;
  return typeof Ctx.prototype.setSinkId === 'function';
}

export function isSelectAudioOutputSupported() {
  return !!(typeof navigator !== 'undefined'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.selectAudioOutput === 'function');
}

export async function enumerateAudioOutputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }
  const list = await navigator.mediaDevices.enumerateDevices();
  return list.filter(function(d) { return d.kind === 'audiooutput'; });
}

export async function promptForAudioOutputDevice(options) {
  if (!isSelectAudioOutputSupported()) {
    throw new Error('Speaker picker is not supported in this browser');
  }
  const opts = options || {};
  const request = { deviceId: opts.deviceId };
  if (!request.deviceId) {
    delete request.deviceId;
  }
  return navigator.mediaDevices.selectAudioOutput(request);
}

function addUniqueContext(contexts, audioContext) {
  if (!audioContext || audioContext.state === 'closed') return;
  if (contexts.indexOf(audioContext) >= 0) return;
  contexts.push(audioContext);
}

export function getMediaControllerAudioElements(mediaController) {
  const elements = [];
  if (!mediaController) return elements;
  if (mediaController.playerRef && mediaController.playerRef.current) {
    elements.push(mediaController.playerRef.current);
  }
  if (mediaController.filteredPlayerRef && mediaController.filteredPlayerRef.current) {
    elements.push(mediaController.filteredPlayerRef.current);
  }
  return elements;
}

export function getMediaControllerAudioContexts(mediaController) {
  const contexts = [];
  if (!mediaController) return contexts;
  if (typeof mediaController.getPlaybackAudioContexts === 'function') {
    mediaController.getPlaybackAudioContexts().forEach(function(ctx) {
      addUniqueContext(contexts, ctx);
    });
  }
  return contexts;
}

export async function applyOutputDeviceToElement(audioEl, deviceId) {
  if (!audioEl || typeof audioEl.setSinkId !== 'function') return false;
  await audioEl.setSinkId(deviceId || '');
  return true;
}

export async function applyOutputDeviceToAudioContext(audioContext, deviceId) {
  if (!audioContext || typeof audioContext.setSinkId !== 'function') return false;
  await audioContext.setSinkId(deviceId || '');
  return true;
}

export async function applyStoredOutputDeviceToElement(audioEl) {
  return applyOutputDeviceToElement(audioEl, getOutputDeviceId());
}

export async function applyOutputDeviceToPlaybackTargets(targets, deviceId) {
  const sinkId = deviceId !== undefined ? (deviceId || '') : getOutputDeviceId();
  const elements = (targets && targets.elements) || [];
  const contexts = (targets && targets.contexts) || [];
  let applied = 0;
  let lastError = null;

  for (let i = 0; i < elements.length; i++) {
    try {
      if (await applyOutputDeviceToElement(elements[i], sinkId)) {
        applied += 1;
      }
    } catch (err) {
      lastError = err;
    }
  }

  for (let j = 0; j < contexts.length; j++) {
    try {
      if (await applyOutputDeviceToAudioContext(contexts[j], sinkId)) {
        applied += 1;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (applied === 0 && lastError) {
    throw lastError;
  }
  return { applied: applied, deviceId: sinkId };
}

export function getAudioContextConstructorOptions(deviceId) {
  const sinkId = deviceId !== undefined ? (deviceId || '') : getOutputDeviceId();
  if (!sinkId) return undefined;
  return { sinkId: sinkId };
}

export function createPlaybackAudioContext(deviceId) {
  const Ctx = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null;
  if (!Ctx) return null;
  const options = getAudioContextConstructorOptions(deviceId);
  if (options) {
    try {
      return new Ctx(options);
    } catch (e) {
      // Fall back when sinkId is unsupported or rejected.
    }
  }
  return new Ctx();
}

export async function ensurePermittedOutputDeviceId(deviceId) {
  const sinkId = deviceId || '';
  if (!sinkId || !isSelectAudioOutputSupported()) {
    return sinkId;
  }
  try {
    const device = await promptForAudioOutputDevice({ deviceId: sinkId });
    return device.deviceId || sinkId;
  } catch (err) {
    if (err && err.name === 'NotAllowedError') {
      throw err;
    }
    return sinkId;
  }
}

export async function applyOutputDeviceToMediaController(mediaController, deviceId) {
  if (deviceId !== undefined && mediaController && typeof mediaController.applyOutputDevice === 'function') {
    return mediaController.applyOutputDevice(deviceId);
  }
  if (mediaController && typeof mediaController.reapplyStoredOutputDevice === 'function') {
    return mediaController.reapplyStoredOutputDevice();
  }
  const sinkId = deviceId !== undefined ? (deviceId || '') : getOutputDeviceId();
  return applyOutputDeviceToPlaybackTargets({
    elements: getMediaControllerAudioElements(mediaController),
    contexts: getMediaControllerAudioContexts(mediaController),
  }, sinkId);
}
