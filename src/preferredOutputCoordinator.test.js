import { hasHomeSnapcastPlayback } from './preferredOutputCoordinator';
import { clearActiveMediaProxyBase } from './mediaProxyClient';

describe('hasHomeSnapcastPlayback', function() {
  beforeEach(function() {
    clearActiveMediaProxyBase();
  });

  test('returns true for reachable home resolver with snapcastPlayback', function() {
    expect(hasHomeSnapcastPlayback({
      candidates: [{
        base: 'https://peppertrees.example.com',
        reachable: true,
        available: true,
        features: { snapcastPlayback: true },
      }],
    })).toBe(true);
  });

  test('returns true when reachable but awaiting sign-in', function() {
    expect(hasHomeSnapcastPlayback({
      candidates: [{
        base: 'https://peppertrees.example.com',
        reachable: true,
        available: false,
        requireAuth: true,
        features: { snapcastPlayback: true },
      }],
    })).toBe(true);
  });

  test('uses snapcastPlaybackBase from health status', function() {
    expect(hasHomeSnapcastPlayback({
      snapcastPlaybackBase: 'https://peppertrees.example.com',
      candidates: [],
    })).toBe(true);
  });

  test('uses snapcast.enabled on active home resolver', function() {
    expect(hasHomeSnapcastPlayback({
      activeBase: 'https://peppertrees.example.com',
      snapcast: { enabled: true },
      candidates: [],
    })).toBe(true);
  });

  test('ignores cloud light resolver', function() {
    expect(hasHomeSnapcastPlayback({
      candidates: [{
        base: 'https://resolver-light.example.com',
        reachable: true,
        available: true,
        features: { snapcastPlayback: true },
      }],
    })).toBe(false);
  });

  test('returns false when no candidates', function() {
    expect(hasHomeSnapcastPlayback(null)).toBe(false);
    expect(hasHomeSnapcastPlayback({ candidates: [] })).toBe(false);
  });
});
