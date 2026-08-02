import {
  EDITOR_SUBDIVISION_PULSES,
  EDITOR_SUBDIVISION_BEATS,
  EDITOR_SUBDIVISION_HALF_PULSES,
} from './rhythmGranularity'

const EDITOR_MODE_KEY = 'abcbook-drum-editor-mode'
const GRID_COLLAPSED_KEY = 'abcbook-drum-grid-collapsed'
const EDITOR_SUBDIVISION_KEY = 'abcbook-drum-editor-subdivision'

export const EDITOR_MODE_SIMPLE = 'simple'
export const EDITOR_MODE_ADVANCED = 'advanced'

const VALID_SUBDIVISIONS = [
  EDITOR_SUBDIVISION_BEATS,
  EDITOR_SUBDIVISION_PULSES,
  EDITOR_SUBDIVISION_HALF_PULSES,
]

export function loadDrumEditorMode() {
  try {
    const value = localStorage.getItem(EDITOR_MODE_KEY)
    if (value === EDITOR_MODE_ADVANCED) return EDITOR_MODE_ADVANCED
    return EDITOR_MODE_SIMPLE
  } catch (e) {
    return EDITOR_MODE_SIMPLE
  }
}

export function saveDrumEditorMode(mode) {
  try {
    localStorage.setItem(EDITOR_MODE_KEY, mode === EDITOR_MODE_ADVANCED
      ? EDITOR_MODE_ADVANCED
      : EDITOR_MODE_SIMPLE)
  } catch (e) { /* ignore */ }
}

export function loadDrumGridCollapsed() {
  try {
    return localStorage.getItem(GRID_COLLAPSED_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function saveDrumGridCollapsed(collapsed) {
  try {
    localStorage.setItem(GRID_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch (e) { /* ignore */ }
}

export function loadEditorSubdivision() {
  try {
    const value = localStorage.getItem(EDITOR_SUBDIVISION_KEY)
    if (VALID_SUBDIVISIONS.includes(value)) return value
    return EDITOR_SUBDIVISION_PULSES
  } catch (e) {
    return EDITOR_SUBDIVISION_PULSES
  }
}

export function saveEditorSubdivision(subdivision) {
  try {
    if (!VALID_SUBDIVISIONS.includes(subdivision)) return
    localStorage.setItem(EDITOR_SUBDIVISION_KEY, subdivision)
  } catch (e) { /* ignore */ }
}
