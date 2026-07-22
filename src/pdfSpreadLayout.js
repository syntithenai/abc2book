const PAGE_GAP_PX = 12
const PAGE_WIDTH_PER_HEIGHT = 0.707
const TOOLBAR_ALLOWANCE_PX = 48
const EMBEDDED_TOOLBAR_ALLOWANCE_PX = 0
const MAX_SPREAD_COUNT = 4

export function computePdfSpreadLayout(options) {
  const opts = options || {}
  const containerWidth = Math.max(120, Number(opts.containerWidth) || 0)
  const containerHeight = Math.max(120, Number(opts.containerHeight) || 0)
  const fitMode = opts.fitMode === 'width' ? 'width' : 'height'
  const toolbarAllowance = opts.toolbarEmbedded
    ? EMBEDDED_TOOLBAR_ALLOWANCE_PX
    : TOOLBAR_ALLOWANCE_PX
  const availHeight = Math.max(120, containerHeight - toolbarAllowance)
  const availWidth = Math.max(120, containerWidth - 8)
  const fullHeightPageWidth = availHeight * PAGE_WIDTH_PER_HEIGHT

  let spreadCount = 1
  if (fitMode === 'height') {
    for (let count = MAX_SPREAD_COUNT; count >= 2; count -= 1) {
      const totalWidth = (count * fullHeightPageWidth) + ((count - 1) * PAGE_GAP_PX)
      if (totalWidth <= availWidth) {
        spreadCount = count
        break
      }
    }
  }

  let pageWidth = fullHeightPageWidth
  if (spreadCount === 1) {
    pageWidth = fitMode === 'width'
      ? availWidth
      : Math.min(availWidth, fullHeightPageWidth)
  }

  return {
    spreadCount: spreadCount,
    pageWidth: Math.max(120, pageWidth),
  }
}
