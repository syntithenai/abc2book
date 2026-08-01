const EDITOR_MODE_KEY = 'abcbook-drum-editor-mode'
const GRID_COLLAPSED_KEY = 'abcbook-drum-grid-collapsed'

export const EDITOR_MODE_SIMPLE = 'simple'
export const EDITOR_MODE_ADVANCED = 'advanced'

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
