import { isMediaProxyConfigured } from './mediaProxyClient';
import { getMediaResolverHealthState } from './mediaResolverHealthStore';
import { isResolverMediaSearchAvailable } from './mediaSearchResolverClient';

jest.mock('./mediaProxyClient', function() {
  return {
    isMediaProxyConfigured: jest.fn(),
  };
});

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(),
  };
});

describe('mediaSearchResolverClient', function() {
  beforeEach(function() {
    isMediaProxyConfigured.mockReset();
    getMediaResolverHealthState.mockReset();
  });

  test('returns false when proxy is not configured', function() {
    isMediaProxyConfigured.mockReturnValue(false);
    expect(isResolverMediaSearchAvailable()).toBe(false);
  });

  test('returns true when proxy is configured and health is unknown', function() {
    isMediaProxyConfigured.mockReturnValue(true);
    getMediaResolverHealthState.mockReturnValue({ checked: false, available: false });
    expect(isResolverMediaSearchAvailable()).toBe(true);
  });

  test('returns false when health check completed and resolver is unavailable', function() {
    isMediaProxyConfigured.mockReturnValue(true);
    getMediaResolverHealthState.mockReturnValue({ checked: true, available: false });
    expect(isResolverMediaSearchAvailable()).toBe(false);
  });

  test('returns false when the device is offline', function() {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      isMediaProxyConfigured.mockReturnValue(true);
      getMediaResolverHealthState.mockReturnValue({ checked: false, available: false });
      expect(isResolverMediaSearchAvailable()).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
    }
  });
});
