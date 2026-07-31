import {
  controlUrlToJsonRpcWs,
  getStoredSnapcastControlUrl,
  isValidSnapcastControlUrl,
  normalizeSnapcastControlUrl,
  resolveSnapcastControlUrl,
  setStoredSnapcastControlUrl,
  snapcastAvailableFromHealth,
  snapcastMixedContentWarning,
} from './snapcastSupport';

describe('snapcastSupport', function() {
  test('controlUrlToJsonRpcWs converts http to ws jsonrpc', function() {
    expect(controlUrlToJsonRpcWs('http://localhost:1780')).toBe('ws://localhost:1780/jsonrpc');
    expect(controlUrlToJsonRpcWs('https://host.example/snapcast')).toBe('wss://host.example/snapcast/jsonrpc');
  });

  test('normalizeSnapcastControlUrl rejects event objects and garbage', function() {
    expect(normalizeSnapcastControlUrl({})).toBe('');
    expect(normalizeSnapcastControlUrl('[object Object]')).toBe('');
    expect(isValidSnapcastControlUrl('[object Object]')).toBe(false);
    expect(normalizeSnapcastControlUrl('http://localhost:1780')).toBe('http://localhost:1780');
  });

  test('getStoredSnapcastControlUrl clears invalid stored values', function() {
    localStorage.setItem('abc2book.snapcast.controlUrl', '[object Object]');
    expect(getStoredSnapcastControlUrl()).toBe('');
    expect(localStorage.getItem('abc2book.snapcast.controlUrl')).toBe(null);
  });

  test('resolveSnapcastControlUrl prefers stored override over health', function() {
    setStoredSnapcastControlUrl('http://override:1780');
    expect(resolveSnapcastControlUrl({
      snapcast: { controlUrl: 'http://resolver:1780' },
    })).toBe('http://override:1780');
    setStoredSnapcastControlUrl('');
  });

  test('resolveSnapcastControlUrl uses health when no override', function() {
    expect(resolveSnapcastControlUrl({
      snapcast: { controlUrl: 'http://resolver:1780' },
    })).toBe('http://resolver:1780');
  });

  test('snapcastAvailableFromHealth requires reachable sidecar', function() {
    expect(snapcastAvailableFromHealth({
      snapcast: { enabled: true, reachable: true },
    })).toBe(true);
    expect(snapcastAvailableFromHealth({
      snapcast: { enabled: true, reachable: false },
    })).toBe(false);
  });

  test('snapcastMixedContentWarning on https page with http control url', function() {
    const prev = window.location;
    delete window.location;
    window.location = { protocol: 'https:' };
    expect(snapcastMixedContentWarning('http://resolver:1780')).toMatch(/HTTP/);
    expect(snapcastMixedContentWarning('https://resolver/snapcast')).toBe('');
    window.location = prev;
  });
});
