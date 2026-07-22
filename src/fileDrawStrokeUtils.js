export function createStroke(tool, color, width) {
  return {
    tool: tool === 'eraser' ? 'eraser' : 'pen',
    color: color || '#111111',
    width: width || 3,
    points: [],
  }
}

export function appendStrokePoint(stroke, x, y, pressure) {
  if (!stroke) return stroke
  stroke.points.push({
    x: x,
    y: y,
    pressure: pressure > 0 ? pressure : 0.5,
  })
  return stroke
}

export function drawStrokeOnContext(ctx, stroke) {
  if (!ctx || !stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return
  const pts = stroke.points
  ctx.save()
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color || '#111'
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (pts.length === 1) {
    const w = (stroke.width || 3) * (pts[0].pressure || 0.5)
    ctx.lineWidth = Math.max(1, w)
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const midX = (prev.x + cur.x) / 2
      const midY = (prev.y + cur.y) / 2
      ctx.lineWidth = Math.max(1, (stroke.width || 3) * (cur.pressure || 0.5))
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawTextBlocksOnContext(ctx, textBlocks, canvasWidth, canvasHeight) {
  if (!ctx || !canvasWidth || !canvasHeight) return
  ;(textBlocks || []).forEach(function(block) {
    const x = ((block.x || 0) / 100) * canvasWidth
    const y = ((block.y || 0) / 100) * canvasHeight
    const fontSize = block.fontSize || 16
    const text = String(block.text || '').trim()
    if (!text) return
    ctx.save()
    ctx.fillStyle = block.color || '#111111'
    ctx.font = fontSize + 'px sans-serif'
    ctx.textBaseline = 'top'
    const lines = text.split('\n')
    let lineY = y + 4
    const maxWidth = Math.max(20, ((block.width || 30) / 100) * canvasWidth - 8)
    lines.forEach(function(line) {
      if (!line) {
        lineY += fontSize * 1.25
        return
      }
      const words = line.split(' ')
      let current = ''
      words.forEach(function(word, index) {
        const trial = current ? current + ' ' + word : word
        if (ctx.measureText(trial).width > maxWidth && current) {
          ctx.fillText(current, x + 4, lineY)
          lineY += fontSize * 1.25
          current = word
        } else {
          current = trial
        }
        if (index === words.length - 1 && current) {
          ctx.fillText(current, x + 4, lineY)
          lineY += fontSize * 1.25
        }
      })
    })
    ctx.restore()
  })
}

export function redrawInkLayer(canvas, strokes, baseImage, textBlocks) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height)
  }
  ;(strokes || []).forEach(function(stroke) {
    drawStrokeOnContext(ctx, stroke)
  })
  if (textBlocks && textBlocks.length) {
    drawTextBlocksOnContext(ctx, textBlocks, canvas.width, canvas.height)
  }
}

export async function compositeImageAndInk(baseImage, inkCanvas) {
  const width = baseImage.naturalWidth || baseImage.width
  const height = baseImage.naturalHeight || baseImage.height
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(baseImage, 0, 0, width, height)
  if (inkCanvas) {
    ctx.drawImage(inkCanvas, 0, 0, width, height)
  }
  return new Promise(function(resolve, reject) {
    out.toBlob(function(blob) {
      if (blob) resolve(blob)
      else reject(new Error('Could not export drawing'))
    }, 'image/png')
  })
}

/**
 * Load a blob into an HTMLImageElement.
 * Keeps the object URL on img.src for display — call revokeObjectURL(img.src) when done.
 */
export function loadImageFromBlob(blob) {
  return new Promise(function(resolve, reject) {
    if (!blob) {
      reject(new Error('Missing image blob'))
      return
    }
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = function() {
      // Do not revoke here: FileDrawStage renders via <img src={image.src}>.
      resolve(img)
    }
    img.onerror = function() {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}
