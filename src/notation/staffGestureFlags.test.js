import {
  isShiftMarqueeEnabled,
  isCoarsePointerEvent,
  NOTATION_SHIFT_MARQUEE_KEY,
} from './staffGestureFlags';

describe('staffGestureFlags', function() {
  afterEach(function() {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(NOTATION_SHIFT_MARQUEE_KEY);
    }
  });

  test('isShiftMarqueeEnabled defaults true', function() {
    expect(isShiftMarqueeEnabled()).toBe(true);
  });

  test('isShiftMarqueeEnabled false when localStorage 0', function() {
    window.localStorage.setItem(NOTATION_SHIFT_MARQUEE_KEY, '0');
    expect(isShiftMarqueeEnabled()).toBe(false);
  });

  test('isCoarsePointerEvent detects touch', function() {
    expect(isCoarsePointerEvent({ pointerType: 'touch' })).toBe(true);
    expect(isCoarsePointerEvent({ pointerType: 'mouse' })).toBe(false);
  });
});
