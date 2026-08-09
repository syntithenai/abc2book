import {
  getOutputDeviceId,
  setOutputDeviceId,
  OUTPUT_DEVICE_CHANGED_EVENT,
} from './outputDeviceSettings';

describe('outputDeviceSettings', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  it('defaults to empty string', function() {
    expect(getOutputDeviceId()).toBe('');
  });

  it('persists and clears device id', function() {
    expect(setOutputDeviceId('speaker-123')).toBe('speaker-123');
    expect(getOutputDeviceId()).toBe('speaker-123');
    expect(setOutputDeviceId('')).toBe('');
    expect(getOutputDeviceId()).toBe('');
  });

  it('dispatches change event when device id updates', function() {
    const handler = jest.fn();
    window.addEventListener(OUTPUT_DEVICE_CHANGED_EVENT, handler);
    setOutputDeviceId('speaker-abc');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(OUTPUT_DEVICE_CHANGED_EVENT, handler);
  });
});
