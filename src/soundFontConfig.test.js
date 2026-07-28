import {
  getPlaybackSoundFontPlan,
  getSelectionSoundFontUrl,
  ONLINE_MUSYNGKITE_CDN,
} from './soundFontConfig';

describe('getPlaybackSoundFontPlan', function() {
  test('defaults to embedded selection with remap', function() {
    const plan = getPlaybackSoundFontPlan({});
    expect(plan.bank).toBe('selection');
    expect(plan.remap).toBe(true);
    expect(plan.url).toContain('selection/MusyngKite');
  });

  test('uses online bank when tune requests online soundfonts', function() {
    const plan = getPlaybackSoundFontPlan({ tune: { soundFonts: 'online' } });
    expect(plan.bank).toBe('online');
    expect(plan.remap).toBe(false);
    expect(plan.url).toContain('MusyngKite');
  });

  test('local tune preference keeps selection even when online requested with local', function() {
    const plan = getPlaybackSoundFontPlan({
      tune: { soundFonts: 'local' },
    });
    expect(plan.bank).toBe('selection');
    expect(plan.remap).toBe(true);
  });

  test('getSelectionSoundFontUrl points at selection path', function() {
    expect(getSelectionSoundFontUrl()).toContain('selection/MusyngKite');
  });

  test('online plan uses CDN when resolver not ready', function() {
    const plan = getPlaybackSoundFontPlan({ tune: { soundFonts: 'online' } });
    expect(plan.url).toBe(ONLINE_MUSYNGKITE_CDN);
  });
});
