const GIG_FONT_SCALE_KEY = 'bookstorage_gig_font_scale';
const GIG_NIGHT_MODE_KEY = 'bookstorage_gig_night_mode';

export function getGigFontScale() {
  try {
    const raw = localStorage.getItem(GIG_FONT_SCALE_KEY);
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return 1.2;
    return clampGigZoom(value);
  } catch (e) {
    return 1.2;
  }
}

export function clampGigZoom(scale) {
  const value = parseFloat(scale);
  if (!Number.isFinite(value) || value <= 0) return 1.2;
  return Math.min(2.5, Math.max(0.8, value));
}

export function getTuneGigZoom(tune) {
  if (tune && tune.zoom > 0) return clampGigZoom(tune.zoom);
  return getGigFontScale();
}

export function setGigFontScale(scale) {
  const next = clampGigZoom(scale);
  localStorage.setItem(GIG_FONT_SCALE_KEY, String(next));
  return next;
}

export function getGigNightMode() {
  try {
    return localStorage.getItem(GIG_NIGHT_MODE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function setGigNightMode(enabled) {
  const next = !!enabled;
  try {
    localStorage.setItem(GIG_NIGHT_MODE_KEY, next ? '1' : '0');
  } catch (e) {
    // ignore quota errors
  }
  return next;
}

export function toggleGigNightMode() {
  return setGigNightMode(!getGigNightMode());
}
