import {
  formatGpuBusyError,
  isGpuBusyError,
  withGpuBusyRetries,
} from './gpuBusyRetry';

describe('gpuBusyRetry', function() {
  test('isGpuBusyError detects heavy queue and prep failures', function() {
    expect(isGpuBusyError('Heavy job queue busy; try again shortly')).toBe(true);
    expect(isGpuBusyError(new Error('Audio generation in progress; try again shortly'))).toBe(true);
    expect(isGpuBusyError('Media proxy error 503: GPU prep failed: boom')).toBe(true);
    expect(isGpuBusyError('Media proxy error 500: oops')).toBe(false);
  });

  test('formatGpuBusyError rewrites queue messages', function() {
    expect(formatGpuBusyError('Heavy job queue busy (max 1 concurrent); try again shortly'))
      .toMatch(/GPU is busy/);
  });

  test('withGpuBusyRetries succeeds after busy then ok', async function() {
    let calls = 0;
    const result = await withGpuBusyRetries(async function() {
      calls += 1;
      if (calls < 2) throw new Error('Heavy job queue busy');
      return 'ok';
    }, { delayMs: 1, maxRetries: 2 });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  test('withGpuBusyRetries exhausts retries then busy error', async function() {
    await expect(withGpuBusyRetries(async function() {
      throw new Error('Heavy job queue busy');
    }, { delayMs: 1, maxRetries: 1 })).rejects.toThrow(/GPU is busy/);
  });
});
