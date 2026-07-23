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

export const SCRATCHPAD_SHORTCUT_BINDINGS = [
  { id: 'playStop', key: ' ', ctrl: false },
  { id: 'undo', key: 'z', ctrl: true },
  { id: 'redo', key: 'y', ctrl: true },
  { id: 'cut', key: 'x', ctrl: true },
  { id: 'copy', key: 'c', ctrl: true },
  { id: 'paste', key: 'v', ctrl: true },
  { id: 'delete', key: 'k', ctrl: true },
  { id: 'deleteKey', key: 'Delete' },
  { id: 'deleteBackspace', key: 'Backspace' },
  { id: 'silence', key: 'l', ctrl: true },
  { id: 'trim', key: 't', ctrl: true },
  { id: 'split', key: 'i', ctrl: true },
  { id: 'selectAll', key: 'a', ctrl: true },
  { id: 'selectNone', key: 'a', ctrl: true, shift: true },
  { id: 'zoomIn', key: '1', ctrl: true },
  { id: 'zoomOut', key: '3', ctrl: true },
  { id: 'record', key: 'r', ctrl: false },
  { id: 'loopToggle', key: 'l', ctrl: false },
  { id: 'loopSetSelection', key: 'l', ctrl: false, shift: true },
  { id: 'addMarker', key: 'b', ctrl: true },
  { id: 'addMarkerPlayhead', key: 'm', ctrl: true },
  { id: 'export', key: 'e', ctrl: true, shift: true },
  { id: 'preferences', key: 'p', ctrl: true },
  { id: 'toolSelect', key: 'F1' },
  { id: 'seekHome', key: 'Home' },
  { id: 'seekEnd', key: 'End' },
  { id: 'selLeftBracket', code: 'BracketLeft' },
  { id: 'selRightBracket', code: 'BracketRight' },
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
