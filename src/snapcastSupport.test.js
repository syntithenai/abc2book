import {
  controlUrlToJsonRpcWs,
  resolveSnapcastControlUrl,
  snapcastAvailableFromHealth,
  snapcastMixedContentWarning,
} from './snapcastSupport';

describe('snapcastSupport', function() {
  test('controlUrlToJsonRpcWs converts http to ws jsonrpc', function() {
    expect(controlUrlToJsonRpcWs('http://localhost:1780')).toBe('ws://localhost:1780/jsonrpc');
    expect(controlUrlToJsonRpcWs('https://host.example/snapcast')).toBe('wss://host.example/snapcast/jsonrpc');
  });

  test('resolveSnapcastControlUrl prefers health status', function() {
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
