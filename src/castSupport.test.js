import {
  castPublicBaseFromHealthStatus,
  isLocalhostCastBase,
  resolveCastMediaBase,
  setCastPublicBaseFromHealth,
} from './castSupport';

describe('castSupport', function() {
  const originalEnv = process.env;

  beforeEach(function() {
    process.env = Object.assign({}, originalEnv);
    delete process.env.REACT_APP_CAST_RESOLVER_BASE;
    setCastPublicBaseFromHealth(null);
  });

  afterAll(function() {
    process.env = originalEnv;
  });

  test('castPublicBaseFromHealthStatus reads health.cast.publicBase', function() {
    expect(castPublicBaseFromHealthStatus({
      cast: { enabled: true, publicBase: 'https://peppertrees.example.com' },
    })).toBe('https://peppertrees.example.com');
  });

  test('resolveCastMediaBase prefers health publicBase over active proxy', function() {
    setCastPublicBaseFromHealth('https://peppertrees.example.com');
    expect(resolveCastMediaBase()).toBe('https://peppertrees.example.com');
  });

  test('resolveCastMediaBase uses healthStatus.cast.publicBase', function() {
    expect(resolveCastMediaBase({
      healthStatus: { cast: { publicBase: 'https://resolver.example.com' } },
    })).toBe('https://resolver.example.com');
  });

  test('isLocalhostCastBase detects localhost', function() {
    expect(isLocalhostCastBase('http://localhost:8787')).toBe(true);
    expect(isLocalhostCastBase('https://peppertrees.example.com')).toBe(false);
  });
});
