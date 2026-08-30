/**
 * Client-side crop image prep before re-OMR (rotate / flip / contrast / trim).
 */

function loadImageFromBlob(blob) {
  return new Promise(function(resolve, reject) {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = function() {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = function() {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load crop image'))
    }
    img.src = url
  })
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise(function(resolve, reject) {
    canvas.toBlob(function(blob) {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode crop image'))
    }, 'image/jpeg', quality == null ? 0.92 : quality)
  })
}

/**
 * @param {Blob} blob
 * @param {{
 *   rotateDeg?: number,
 *   flipH?: boolean,
 *   flipV?: boolean,
 *   contrast?: number,
 *   brightness?: number,
 *   trimPct?: number,
 * }} ops
 * @returns {Promise<Blob>}
 */
export async function applyCropPrep(blob, ops) {
  if (!blob) throw new Error('Crop blob required')
  const o = ops || {}
  const img = await loadImageFromBlob(blob)
  let w = img.width
  let h = img.height
  const rotateDeg = Number(o.rotateDeg) || 0
  const quarter = ((rotateDeg % 360) + 360) % 360
  const swap = quarter === 90 || quarter === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (quarter) ctx.rotate((quarter * Math.PI) / 180)
  const scaleX = o.flipH ? -1 : 1
  const scaleY = o.flipV ? -1 : 1
  ctx.scale(scaleX, scaleY)
  ctx.drawImage(img, -w / 2, -h / 2)
  ctx.restore()

  const contrast = Number(o.contrast)
  const brightness = Number(o.brightness)
  if ((Number.isFinite(contrast) && contrast !== 1) || (Number.isFinite(brightness) && brightness !== 0)) {
    const c = Number.isFinite(contrast) ? contrast : 1
    const b = Number.isFinite(brightness) ? brightness : 0
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const intercept = 128 * (1 - c) + b * 255
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] * c + intercept))
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * c + intercept))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * c + intercept))
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const trimPct = Number(o.trimPct) || 0
  if (trimPct > 0 && trimPct < 0.45) {
    const tw = Math.round(canvas.width * trimPct)
    const th = Math.round(canvas.height * trimPct)
    const cw = canvas.width - tw * 2
    const ch = canvas.height - th * 2
    if (cw > 8 && ch > 8) {
      const trimmed = document.createElement('canvas')
      trimmed.width = cw
      trimmed.height = ch
      trimmed.getContext('2d').drawImage(canvas, tw, th, cw, ch, 0, 0, cw, ch)
      return canvasToJpegBlob(trimmed)
    }
  }

  return canvasToJpegBlob(canvas)
}
