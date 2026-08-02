import { getAudioGenerationAccess } from './audioGenerationAccess';
import { FEED_FEEDBACK_ADMIN_EMAIL } from './feedFeedbackUtils';

const adminUser = { email: FEED_FEEDBACK_ADMIN_EMAIL };

describe('getAudioGenerationAccess', function() {
  test('hides buttons for non-admin users', function() {
    const access = getAudioGenerationAccess({
      user: { email: 'other@example.com' },
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: true },
      accessToken: 'token',
      resolverStatus: { available: true, features: { practiceTrack: true } },
    });
    expect(access.showButton).toBe(false);
    expect(access.canGenerate).toBe(false);
    expect(access.practiceTrackAvailable).toBe(false);
    expect(access.linkedCoverAvailable).toBe(false);
  });

  test('shows buttons when practiceTrack feature is on and user is logged in', function() {
    const access = getAudioGenerationAccess({
      user: adminUser,
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: true },
      accessToken: 'token',
      resolverStatus: { available: true, features: { practiceTrack: true } },
    });
    expect(access.showButton).toBe(true);
    expect(access.canGenerate).toBe(true);
    expect(access.practiceTrackAvailable).toBe(true);
    expect(access.linkedCoverAvailable).toBe(true);
  });

  test('shows buttons from backends response without health feature flag', function() {
    const access = getAudioGenerationAccess({
      user: adminUser,
      resolverChecked: true,
      resolverAvailable: true,
      features: { practiceTrack: false },
      accessToken: 'token',
      resolverStatus: { available: true, authorized: true },
      backends: {
        ok: true,
        tasks: [
          { taskId: 'linked_cover', presets: [{ id: 'fast', available: true }] },
        ],
      },
    });
    expect(access.showButton).toBe(true);
    expect(access.linkedCoverAvailable).toBe(true);
  });
});
