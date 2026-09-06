/**
 * Client-side retries when the resolver heavy-job queue / GPU prep is busy.
 * Server already waits HEAVY_JOB_QUEUE_TIMEOUT_SECONDS; these are extra attempts
 * before surfacing a final busy error (UI stays interactive).
 */

export const GPU_BUSY_MAX_RETRIES = 2;
export const GPU_BUSY_RETRY_DELAY_MS = 5000;

export function isGpuBusyError(errorOrMessage) {
  const message = String(
    (errorOrMessage && errorOrMessage.message) || errorOrMessage || ''
  ).toLowerCase();
  if (!message) return false;
  return (
    message.indexOf('heavy job queue busy') >= 0
    || message.indexOf('audio generation in progress') >= 0
    || message.indexOf('gpu prep failed') >= 0
    || message.indexOf('gpu_busy') >= 0
    || message.indexOf('waiting for gpu') >= 0
    || (message.indexOf('media proxy error 503') >= 0
      && (message.indexOf('busy') >= 0
        || message.indexOf('queue') >= 0
        || message.indexOf('gpu') >= 0
        || message.indexOf('audio generation') >= 0))
  );
}

export function formatGpuBusyError(errorOrMessage) {
  const raw = String(
    (errorOrMessage && errorOrMessage.message) || errorOrMessage || ''
  ).trim();
  if (!raw) {
    return 'GPU is busy with another job. Try again in a minute.';
  }
  if (/heavy job queue busy/i.test(raw) || /audio generation in progress/i.test(raw)) {
    return 'GPU is busy with another job. Wait for it to finish, then try again.';
  }
  if (/gpu prep failed/i.test(raw)) {
    return 'Could not free GPU memory (Qwen/Comfy) before starting. Try again shortly.';
  }
  return raw.replace(/^Media proxy error 503:\s*/i, '');
}

function sleep(ms, signal) {
  return new Promise(function(resolve, reject) {
    if (signal && signal.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = function() {
        clearTimeout(timer);
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Run asyncFn; on GPU-busy errors wait and retry, then throw a formatted busy error.
 *
 * @param {function(): Promise<*>} asyncFn
 * @param {{ maxRetries?: number, delayMs?: number, onWaiting?: function(object): void, signal?: AbortSignal }} [options]
 */
export async function withGpuBusyRetries(asyncFn, options) {
  const opts = options || {};
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : GPU_BUSY_MAX_RETRIES;
  const delayMs = opts.delayMs != null ? opts.delayMs : GPU_BUSY_RETRY_DELAY_MS;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      return await asyncFn();
    } catch (err) {
      lastError = err;
      if (!isGpuBusyError(err) || attempt >= maxRetries) {
        if (isGpuBusyError(err)) {
          throw new Error(formatGpuBusyError(err));
        }
        throw err;
      }
      if (typeof opts.onWaiting === 'function') {
        opts.onWaiting({
          attempt: attempt + 1,
          maxRetries: maxRetries,
          message: 'Waiting for GPU…',
          error: err,
        });
      }
      await sleep(delayMs, opts.signal);
      attempt += 1;
    }
  }

  throw new Error(formatGpuBusyError(lastError));
}
