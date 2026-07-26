export const NOTATION_SHIFT_MARQUEE_KEY = 'notationShiftMarquee';
export const STAFF_LONG_PRESS_MS = 400;

/** Shift-gated marquee is on by default; set localStorage notationShiftMarquee=0 to restore legacy. */
export function isShiftMarqueeEnabled() {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  const v = window.localStorage.getItem(NOTATION_SHIFT_MARQUEE_KEY);
  if (v === '0' || v === 'false') return false;
  return true;
}

export function isCoarsePointerEvent(e) {
  if (!e) return false;
  if (e.pointerType === 'touch') return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch (err) {
      return false;
    }
  }
  return false;
}
