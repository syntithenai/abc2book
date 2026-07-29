import { useEffect, useCallback } from 'react'

function isMac() {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '')
}

function modKey(e) {
  return isMac() ? e.metaKey : e.ctrlKey
}

function isEditableTarget(target) {
  if (!target) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function matchShortcut(binding, e) {
  if (binding.code) {
    return e.code === binding.code && !!binding.shift === e.shiftKey
      && !!binding.alt === e.altKey && modKey(e) === !!binding.ctrl
  }
  const key = binding.key
  if (!key) return false
  if (key.length === 1) {
    return e.key.toLowerCase() === key.toLowerCase()
      && !!binding.shift === e.shiftKey
      && !!binding.alt === e.altKey
      && modKey(e) === !!binding.ctrl
  }
  return e.key === key
    && !!binding.shift === e.shiftKey
    && !!binding.alt === e.altKey
    && modKey(e) === !!binding.ctrl
}

/** Reaper-oriented defaults; see help for full list. */
export const SCRATCHPAD_SHORTCUT_BINDINGS = [
  { id: 'playStop', key: ' ', ctrl: false, label: 'Play / pause' },
  { id: 'record', key: 'r', ctrl: false, label: 'Record' },
  { id: 'split', key: 's', ctrl: false, label: 'Split at edit cursor' },
  { id: 'undo', key: 'z', ctrl: true, label: 'Undo' },
  { id: 'redo', key: 'r', ctrl: true, label: 'Redo' },
  { id: 'cut', key: 'x', ctrl: true, label: 'Cut' },
  { id: 'copy', key: 'c', ctrl: true, label: 'Copy' },
  { id: 'paste', key: 'v', ctrl: true, label: 'Paste' },
  { id: 'deleteKey', key: 'Delete', label: 'Delete' },
  { id: 'deleteBackspace', key: 'Backspace', label: 'Delete' },
  { id: 'trim', key: 't', ctrl: true, label: 'Trim to time selection' },
  { id: 'silence', key: 'l', ctrl: true, label: 'Silence selection' },
  { id: 'selectAll', key: 'a', ctrl: true, label: 'Select all' },
  { id: 'selectNone', key: 'a', ctrl: true, shift: true, label: 'Unselect all' },
  { id: 'zoomIn', key: '=', ctrl: false, label: 'Zoom in' },
  { id: 'zoomIn', key: '+', ctrl: false, label: 'Zoom in' },
  { id: 'zoomOut', key: '-', ctrl: false, label: 'Zoom out' },
  { id: 'loopToggle', key: 'l', ctrl: false, label: 'Toggle repeat' },
  { id: 'loopSetSelection', key: 'l', ctrl: false, shift: true, label: 'Set loop points to selection' },
  { id: 'addMarkerPlayhead', key: 'm', ctrl: false, label: 'Insert marker at edit cursor' },
  { id: 'addMarker', key: 'm', ctrl: true, label: 'Insert marker (alternate)' },
  { id: 'export', key: 'e', ctrl: true, shift: true, label: 'Export' },
  { id: 'preferences', key: 'p', ctrl: true, label: 'Preferences' },
  { id: 'toolSelect', key: 'F1', label: 'Time selection tool' },
  { id: 'seekHome', key: 'Home', label: 'Go to start of project' },
  { id: 'seekEnd', key: 'End', label: 'Go to end of project' },
  { id: 'selLeftBracket', code: 'BracketLeft', label: 'Set time selection start to edit cursor' },
  { id: 'selRightBracket', code: 'BracketRight', label: 'Set time selection end to edit cursor' },
]

export function shortcutLabel(binding) {
  const parts = []
  if (binding.ctrl) parts.push(isMac() ? '⌘' : 'Ctrl')
  if (binding.shift) parts.push('Shift')
  if (binding.alt) parts.push(isMac() ? '⌥' : 'Alt')
  if (binding.code === 'BracketLeft') parts.push('[')
  else if (binding.code === 'BracketRight') parts.push(']')
  else if (binding.key) parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key)
  return parts.join('+')
}

export default function useScratchpadAudioShortcuts(containerRef, handlers, enabled) {
  const onKeyDown = useCallback(function(e) {
    if (!enabled) return
    if (isEditableTarget(e.target)) return
    const root = containerRef && containerRef.current
    if (root && !root.contains(e.target)) return

    for (let i = 0; i < SCRATCHPAD_SHORTCUT_BINDINGS.length; i += 1) {
      const binding = SCRATCHPAD_SHORTCUT_BINDINGS[i]
      if (!matchShortcut(binding, e)) continue
      const fn = handlers[binding.id]
      if (!fn) continue
      e.preventDefault()
      fn(e)
      return
    }
  }, [containerRef, handlers, enabled])

  useEffect(function() {
    window.addEventListener('keydown', onKeyDown)
    return function() { window.removeEventListener('keydown', onKeyDown) }
  }, [onKeyDown])
}
