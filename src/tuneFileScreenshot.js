import html2canvas from 'html2canvas'

const CHART_PANEL_SELECTORS = [
  '.tune-panel-notation',
  '.tune-panel-lyrics',
  '.tune-panel-structure',
]

function waitTwoFrames() {
  return new Promise(function(resolve) {
    requestAnimationFrame(function() {
      requestAnimationFrame(resolve)
    })
  })
}

/**
 * Capture notation + lyrics + structure panels as one vertical PNG.
 * Temporarily reveals hidden panels (e.g. under file overlay) for the capture.
 */
export async function captureTuneChartPanels() {
  const panels = []
  const restores = []

  for (let i = 0; i < CHART_PANEL_SELECTORS.length; i++) {
    const el = document.querySelector(CHART_PANEL_SELECTORS[i])
    if (!el) continue
    const prevDisplay = el.style.display
    const prevVisibility = el.style.visibility
    el.style.display = 'block'
    el.style.visibility = 'visible'
    restores.push(function() {
      el.style.display = prevDisplay
      el.style.visibility = prevVisibility
    })
    panels.push(el)
  }

  if (panels.length === 0) {
    throw new Error('Nothing to capture')
  }

  try {
    await waitTwoFrames()
    const canvases = []
    for (let i = 0; i < panels.length; i++) {
      const canvas = await html2canvas(panels[i], {
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        canvases.push(canvas)
      }
    }
    if (canvases.length === 0) {
      throw new Error('Capture failed')
    }
    const width = Math.max.apply(null, canvases.map(function(c) { return c.width }))
    let height = 0
    for (let i = 0; i < canvases.length; i++) height += canvases[i].height
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    let y = 0
    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i]
      ctx.drawImage(c, 0, y)
      y += c.height
    }
    const blob = await new Promise(function(resolve) {
      out.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('Capture failed')
    return blob
  } finally {
    for (let i = 0; i < restores.length; i++) restores[i]()
  }
}
