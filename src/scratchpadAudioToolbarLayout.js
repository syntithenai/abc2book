export const SCRATCHPAD_TOOLBAR_WIDE = 1100
export const SCRATCHPAD_TOOLBAR_COMPACT = 768

export function scratchpadToolbarTier(containerWidth) {
  const w = typeof containerWidth === 'number' ? containerWidth : 0
  if (w > 0 && w < SCRATCHPAD_TOOLBAR_COMPACT) return 'narrow'
  if (w > 0 && w < SCRATCHPAD_TOOLBAR_WIDE) return 'compact'
  return 'wide'
}

export function isScratchpadToolbarNarrow(tier) {
  return tier === 'narrow'
}

export function isScratchpadToolbarCompact(tier) {
  return tier === 'compact' || tier === 'narrow'
}
