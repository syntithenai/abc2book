import {
  getOutputDeviceId,
  setOutputDeviceId,
} from './outputDeviceSettings';
import { applyOutputDeviceToPlaybackTargets } from './outputDeviceSupport';

describe('outputDeviceSupport', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  it('applyOutputDeviceToPlaybackTargets uses stored device when deviceId omitted', async function() {
    setOutputDeviceId('speaker-abc');
    const element = {
      setSinkId: jest.fn().mockResolvedValue(undefined),
    };
    const result = await applyOutputDeviceToPlaybackTargets({
      elements: [element],
      contexts: [],
    });
    expect(result.deviceId).toBe('speaker-abc');
    expect(element.setSinkId).toHaveBeenCalledWith('speaker-abc');
  });
});
