import { isRemoteOutputUiEnabled } from './remoteOutputUi';

describe('remoteOutputUi', function() {
  const originalEnv = process.env.REACT_APP_REMOTE_OUTPUT_UI;

  afterEach(function() {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_REMOTE_OUTPUT_UI;
    } else {
      process.env.REACT_APP_REMOTE_OUTPUT_UI = originalEnv;
    }
  });

  test('disabled by default for production', function() {
    delete process.env.REACT_APP_REMOTE_OUTPUT_UI;
    expect(isRemoteOutputUiEnabled()).toBe(false);
  });

  test('enabled when REACT_APP_REMOTE_OUTPUT_UI is true', function() {
    process.env.REACT_APP_REMOTE_OUTPUT_UI = 'true';
    expect(isRemoteOutputUiEnabled()).toBe(true);
  });
});
