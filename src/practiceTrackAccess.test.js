import { getPracticeTrackAccess, getPracticeTrackGenerateLabel } from './practiceTrackAccess';

describe('getPracticeTrackAccess', function() {
  test('hides practice track until resolver health is checked', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: false,
      resolverAvailable: false,
      features: { practiceTrack: true },
    });
    expect(access.showButton).toBe(false);
    expect(access.needsLogin).toBe(false);
  });

  test('shows generate when resolver has practiceTrack', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: true },
      accessToken: 'token',
      resolverStatus: { available: true },
    });
    expect(access.showButton).toBe(true);
    expect(access.needsLogin).toBe(false);
    expect(access.canGenerate).toBe(true);
  });

  test('shows login when resolver is reachable but needs auth', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: true,
      resolverAvailable: false,
      features: { practiceTrack: false },
      accessToken: null,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
          features: { practiceTrack: true },
        }],
      },
    });
    expect(access.showButton).toBe(true);
    expect(access.needsLogin).toBe(true);
    expect(access.canGenerate).toBe(false);
  });

  test('hides when no resolver offers practiceTrack', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: false },
      accessToken: 'token',
      resolverStatus: {
        available: true,
        candidates: [{
          base: 'http://localhost:8787',
          reachable: true,
          available: true,
          features: { practiceTrack: false },
        }],
      },
    });
    expect(access.showButton).toBe(false);
    expect(access.needsLogin).toBe(false);
  });

  test('hides when no resolver is reachable', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: true,
      resolverAvailable: false,
      features: { practiceTrack: true },
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'http://localhost:8787',
          reachable: false,
          available: false,
          features: { practiceTrack: true },
        }],
      },
    });
    expect(access.showButton).toBe(false);
  });

  test('still shows when audio.cpp sidecar is down but feature is enabled', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: true },
      accessToken: 'token',
      resolverStatus: {
        available: true,
        features: { practiceTrack: true },
        practiceTrackBackend: {
          ok: false,
          provider: 'audio_cpp',
          message: 'Sidecar not reachable',
        },
      },
    });
    expect(access.showButton).toBe(true);
    expect(access.canGenerate).toBe(true);
  });

  test('shows when audio.cpp sidecar is healthy', function() {
    const access = getPracticeTrackAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: true },
      accessToken: 'token',
      resolverStatus: {
        available: true,
        features: { practiceTrack: true },
        practiceTrackBackend: {
          ok: true,
          provider: 'audio_cpp',
        },
      },
    });
    expect(access.showButton).toBe(true);
    expect(access.canGenerate).toBe(true);
  });
});

describe('getPracticeTrackGenerateLabel', function() {
  test('uses login label when auth is required', function() {
    expect(getPracticeTrackGenerateLabel({ needsLogin: true }, {})).toBe('Login to Generate');
  });

  test('uses generate label when ready', function() {
    expect(getPracticeTrackGenerateLabel({ needsLogin: false }, {})).toBe('Generate');
  });
});
