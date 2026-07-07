import { DURATION_KEY_MULTIPLIERS } from './notationConstants';

export const DURATION_LABELS = {
  1: '64', 2: '32', 3: '16', 4: '8', 5: '4', 6: '2', 7: '1', 8: '2.', 9: '1..',
};

export const DURATION_KEYS = Object.keys(DURATION_KEY_MULTIPLIERS).map(Number);

export function durationLabel(key) {
  return DURATION_LABELS[key] || String(key);
}
