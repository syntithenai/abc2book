import {
  getOutputDeviceId,
  setOutputDeviceId,
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
});
