/** Undo/redo stack for drum pattern edits (max 32 states). */

const MAX_UNDO = 32

export function createDrumPatternUndoStack(initialPattern) {
  return {
    past: [],
    present: initialPattern ? clonePattern(initialPattern) : null,
    future: [],
  }
}

function clonePattern(pattern) {
  if (!pattern) return null
  return JSON.parse(JSON.stringify(pattern))
}

export function pushDrumPatternState(stack, nextPattern) {
  if (!stack) return stack
  const cloned = clonePattern(nextPattern)
  if (stack.present && patternsJsonEqual(stack.present, cloned)) {
    return stack
  }
  const past = stack.present
    ? stack.past.concat([clonePattern(stack.present)]).slice(-MAX_UNDO)
    : stack.past.slice()
  return {
    past: past,
    present: cloned,
    future: [],
  }
}

export function undoDrumPattern(stack) {
  if (!stack || stack.past.length === 0) return stack
  const previous = stack.past[stack.past.length - 1]
  const future = stack.present
    ? [clonePattern(stack.present)].concat(stack.future)
    : stack.future.slice()
  return {
    past: stack.past.slice(0, -1),
    present: clonePattern(previous),
    future: future,
  }
}

export function redoDrumPattern(stack) {
  if (!stack || stack.future.length === 0) return stack
  const next = stack.future[0]
  const past = stack.present
    ? stack.past.concat([clonePattern(stack.present)])
    : stack.past.slice()
  return {
    past: past,
    present: clonePattern(next),
    future: stack.future.slice(1),
  }
}

export function canUndoDrumPattern(stack) {
  return !!(stack && stack.past.length > 0)
}

export function canRedoDrumPattern(stack) {
  return !!(stack && stack.future.length > 0)
}

function patternsJsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
