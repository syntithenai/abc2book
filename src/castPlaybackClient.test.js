import {
  getCastResolverBase,
  isLocalhostCastBase,
  resolveCastContentUrl,
} from './castPlaybackClient';
import { setCastPublicBaseFromHealth } from './castSupport';

describe('castPlaybackClient', function() {
  const originalEnv = process.env;

  beforeEach(function() {
    jest.resetModules();
    process.env = Object.assign({}, originalEnv);
    delete process.env.REACT_APP_CAST_RESOLVER_BASE;
    setCastPublicBaseFromHealth(null);
  });

  afterAll(function() {
    process.env = originalEnv;
  });

  test('getCastResolverBase prefers health public base', function() {
    setCastPublicBaseFromHealth('https://peppertrees.example.com');
    expect(getCastResolverBase()).toBe('https://peppertrees.example.com');
  });

  test('resolveCastContentUrl rejects localhost base', function() {
    process.env.REACT_APP_CAST_RESOLVER_BASE = 'http://localhost:8787';
    expect(function() {
      resolveCastContentUrl('https://youtu.be/demo', null);
    }).toThrow(/cannot reach localhost/i);
  });

  test('resolveCastContentUrl builds hosted HLS url', function() {
    setCastPublicBaseFromHealth('https://peppertrees.example.com');
    const url = resolveCastContentUrl('https://youtu.be/demo', 'sess-1');
    expect(url).toBe('https://peppertrees.example.com/cast-playback/session/sess-1/playlist.m3u8');
  });

  test('isLocalhostCastBase detects localhost', function() {
    expect(isLocalhostCastBase('http://localhost:8787')).toBe(true);
    expect(isLocalhostCastBase('http://192.168.1.4:8787')).toBe(false);
  });
});
