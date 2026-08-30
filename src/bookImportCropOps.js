/**
 * Crop merge / split / delete helpers for Import Book review sets.
 */
import { rasterizePdfPageToPng } from './tuneFilePdfRasterize'

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
 * Delete a tune and renumber tuneIndex on the same page.
 * @returns {{ tunes: object[], removedCropBlobKey: string }}
 */
export function deleteTuneFromList(tunes, tuneId) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  const index = list.findIndex(function(t) { return t && String(t.id) === String(tuneId) })
  if (index < 0) {
    return { tunes: list, removedCropBlobKey: '' }
  }
  const removed = list[index]
  const page = Number(removed.page) || 1
  list.splice(index, 1)
  const pageTunes = list
    .filter(function(t) { return Number(t.page) === page })
    .sort(function(a, b) { return (Number(a.tuneIndex) || 0) - (Number(b.tuneIndex) || 0) })
  pageTunes.forEach(function(t, i) {
    t.tuneIndex = i + 1
  })
  return {
    tunes: list,
    removedCropBlobKey: removed.cropBlobKey || '',
  }
}

/**
 * Vertically stitch two crop blobs (tune then next).
 */
export async function mergeCropBlobs(blobA, blobB) {
  if (!blobA || !blobB) throw new Error('Both crops are required to merge')
  const imgA = await loadImageFromBlob(blobA)
  const imgB = await loadImageFromBlob(blobB)
  const width = Math.max(imgA.width, imgB.width)
  const height = imgA.height + imgB.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(imgA, 0, 0)
  ctx.drawImage(imgB, 0, imgA.height)
  return canvasToJpegBlob(canvas)
}

/**
 * Split a crop blob at a fractional Y (0–1) or absolute pixel Y.
 * @returns {Promise<{ topBlob: Blob, bottomBlob: Blob, splitY: number }>}
 */
export async function splitCropBlob(blob, splitY, options) {
  if (!blob) throw new Error('Crop is required to split')
  const img = await loadImageFromBlob(blob)
  const opts = options || {}
  let y = Number(splitY)
  if (!Number.isFinite(y)) throw new Error('Split Y is required')
  if (opts.normalized || (y > 0 && y < 1)) {
    y = Math.round(img.height * y)
  }
  y = Math.max(8, Math.min(img.height - 8, Math.round(y)))

  const topCanvas = document.createElement('canvas')
  topCanvas.width = img.width
  topCanvas.height = y
  topCanvas.getContext('2d').drawImage(img, 0, 0, img.width, y, 0, 0, img.width, y)

  const bottomCanvas = document.createElement('canvas')
  bottomCanvas.width = img.width
  bottomCanvas.height = img.height - y
  bottomCanvas.getContext('2d').drawImage(
    img,
    0, y, img.width, img.height - y,
    0, 0, img.width, img.height - y
  )

  const topBlob = await canvasToJpegBlob(topCanvas)
  const bottomBlob = await canvasToJpegBlob(bottomCanvas)
  return { topBlob: topBlob, bottomBlob: bottomBlob, splitY: y }
}

/**
 * Merge tune with the next tune on the same page (by tuneIndex).
 * Caller supplies crop blobs and assigns new cropBlobKey after storing.
 * @returns {{ tunes: object[], mergeTarget: object, removed: object, needsReprocess: true } | null}
 */
export function planMergeWithNext(tunes, tuneId) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  const index = list.findIndex(function(t) { return t && String(t.id) === String(tuneId) })
  if (index < 0) return null
  const current = list[index]
  const page = Number(current.page) || 1
  const nextIndex = list.findIndex(function(t) {
    return t
      && String(t.id) !== String(tuneId)
      && Number(t.page) === page
      && Number(t.tuneIndex) === Number(current.tuneIndex) + 1
  })
  if (nextIndex < 0) return null
  const next = list[nextIndex]
  const merged = Object.assign({}, current, {
    title: current.title || next.title,
    abc: '',
    omrAbc: '',
    candidates: [],
    selectedCandidateId: '',
    complete: false,
    abcSource: '',
    notationIssues: [],
    status: 'pending',
    cropZones: [],
    badSections: [],
  })
  const withoutNext = list.filter(function(t) { return String(t.id) !== String(next.id) })
  const replaced = withoutNext.map(function(t) {
    return String(t.id) === String(current.id) ? merged : t
  })
  const pageTunes = replaced
    .filter(function(t) { return Number(t.page) === page })
    .sort(function(a, b) { return (Number(a.tuneIndex) || 0) - (Number(b.tuneIndex) || 0) })
  pageTunes.forEach(function(t, i) {
    const nextIndex = i + 1
    if (Number(t.tuneIndex) !== nextIndex) {
      const idx = replaced.findIndex(function(x) { return x === t })
      if (idx >= 0) replaced[idx] = Object.assign({}, t, { tuneIndex: nextIndex })
    }
  })
  return {
    tunes: replaced,
    mergeTarget: Object.assign({}, merged, {
      tuneIndex: Number(
        (replaced.find(function(t) { return t && t.id === merged.id }) || merged).tuneIndex
      ) || merged.tuneIndex,
    }),
    removed: next,
    needsReprocess: true,
  }
}

/**
 * Merge tune with the previous tune on the same page (by tuneIndex).
 * @returns {{ tunes: object[], mergeTarget: object, removed: object, needsReprocess: true } | null}
 */
export function planMergeWithPrevious(tunes, tuneId) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  const index = list.findIndex(function(t) { return t && String(t.id) === String(tuneId) })
  if (index < 0) return null
  const current = list[index]
  const page = Number(current.page) || 1
  const prevIndex = list.findIndex(function(t) {
    return t
      && String(t.id) !== String(tuneId)
      && Number(t.page) === page
      && Number(t.tuneIndex) === Number(current.tuneIndex) - 1
  })
  if (prevIndex < 0) return null
  // Merge previous (top) with current (bottom): plan from previous id.
  return planMergeWithNext(list, list[prevIndex].id)
}

/**
 * Merge N consecutive same-page tunes (ordered by tuneIndex). First id is keep target.
 * @param {object[]} tunes
 * @param {string[]} tuneIds
 * @returns {{ tunes: object[], mergeTarget: object, removed: object[], needsReprocess: true } | null}
 */
export function planMergeTunes(tunes, tuneIds) {
  const ids = (Array.isArray(tuneIds) ? tuneIds : []).map(String).filter(Boolean)
  if (ids.length < 2) return null
  let working = Array.isArray(tunes) ? tunes.slice() : []
  const byId = {}
  working.forEach(function(t) { if (t && t.id) byId[String(t.id)] = t })
  const selected = ids.map(function(id) { return byId[id] }).filter(Boolean)
  if (selected.length < 2) return null
  selected.sort(function(a, b) {
    return (Number(a.tuneIndex) || 0) - (Number(b.tuneIndex) || 0)
  })
  const page = Number(selected[0].page) || 1
  if (selected.some(function(t) { return Number(t.page) !== page })) return null
  // Verify consecutive tuneIndex
  for (let i = 1; i < selected.length; i += 1) {
    if (Number(selected[i].tuneIndex) !== Number(selected[i - 1].tuneIndex) + 1) {
      return null
    }
  }
  const removed = []
  let mergeTarget = null
  let keepId = String(selected[0].id)
  for (let i = 0; i < selected.length - 1; i += 1) {
    const plan = planMergeWithNext(working, keepId)
    if (!plan) return null
    working = plan.tunes
    mergeTarget = plan.mergeTarget
    removed.push(plan.removed)
    keepId = String(plan.mergeTarget.id)
  }
  return {
    tunes: working,
    mergeTarget: mergeTarget,
    removed: removed,
    needsReprocess: true,
  }
}

/**
 * Split one tune into two; caller stores blobs and fills cropBlobKeys.
 */
export function planSplitTune(tunes, tuneId, options) {
  const opts = options || {}
  const list = Array.isArray(tunes) ? tunes.slice() : []
  const index = list.findIndex(function(t) { return t && String(t.id) === String(tuneId) })
  if (index < 0) return null
  const current = list[index]
  const page = Number(current.page) || 1
  const topTitle = String(opts.topTitle || current.title || 'Untitled').trim()
  const bottomTitle = String(opts.bottomTitle || (current.title + ' (cont.)')).trim()
  const topTune = Object.assign({}, current, {
    title: topTitle,
    abc: '',
    omrAbc: '',
    candidates: [],
    selectedCandidateId: '',
    complete: false,
    abcSource: '',
    notationIssues: [],
    status: 'pending',
    cropZones: [],
    badSections: [],
    cropBlobKey: '',
  })
  const bottomTune = Object.assign({}, current, {
    id: opts.bottomId || ('tune-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
    title: bottomTitle,
    tuneIndex: Number(current.tuneIndex) + 1,
    abc: '',
    omrAbc: '',
    candidates: [],
    selectedCandidateId: '',
    complete: false,
    abcSource: '',
    notationIssues: [],
    status: 'pending',
    cropZones: [],
    badSections: [],
    cropBlobKey: '',
    cropName: '',
  })
  const next = list.slice()
  next.splice(index, 1, topTune, bottomTune)
  const pageTunes = next
    .filter(function(t) { return Number(t.page) === page })
    .sort(function(a, b) {
      const ai = Number(a.tuneIndex) || 0
      const bi = Number(b.tuneIndex) || 0
      if (a.id === topTune.id) return -1
      if (b.id === topTune.id) return 1
      if (a.id === bottomTune.id && b.id !== topTune.id) return ai <= bi ? -1 : 1
      return ai - bi
    })
  // Stable renumber
  const ordered = next
    .filter(function(t) { return Number(t.page) !== page })
    .concat(
      next
        .filter(function(t) { return Number(t.page) === page })
        .sort(function(a, b) {
          if (a.id === topTune.id) return -1
          if (b.id === topTune.id) return 1
          if (a.id === bottomTune.id) return -1
          if (b.id === bottomTune.id) return 1
          return (Number(a.tuneIndex) || 0) - (Number(b.tuneIndex) || 0)
        })
    )
  const pageOnly = ordered.filter(function(t) { return Number(t.page) === page })
  pageOnly.forEach(function(t, i) {
    t.tuneIndex = i + 1
  })
  return {
    tunes: ordered,
    topTune: topTune,
    bottomTune: bottomTune,
    needsReprocess: true,
  }
}

/** Normalize legacy badSections into cropZones. */
export function getTuneCropZones(tune) {
  if (!tune) return []
  if (Array.isArray(tune.cropZones) && tune.cropZones.length) return tune.cropZones
  if (Array.isArray(tune.badSections) && tune.badSections.length) return tune.badSections
  return Array.isArray(tune.cropZones) ? tune.cropZones : []
}

export function addCropZone(tune, rect) {
  const next = Object.assign({}, tune || {})
  const zones = getTuneCropZones(next).slice()
  zones.push({
    id: 'zone-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    x: Number(rect && rect.x) || 0,
    y: Number(rect && rect.y) || 0,
    width: Number(rect && rect.width) || 0,
    height: Number(rect && rect.height) || 0,
  })
  next.cropZones = zones
  next.badSections = []
  return next
}

export function removeCropZone(tune, zoneId) {
  const next = Object.assign({}, tune || {})
  next.cropZones = getTuneCropZones(next).filter(function(s) {
    return s && String(s.id) !== String(zoneId)
  })
  next.badSections = []
  return next
}

/** @deprecated Use addCropZone */
export function addBadSection(tune, rect) {
  return addCropZone(tune, rect)
}

/** @deprecated Use removeCropZone */
export function removeBadSection(tune, sectionId) {
  return removeCropZone(tune, sectionId)
}

/**
 * Convert %-normalized crop zones to pixel strips, sorted by y then x.
 */
export function cropZonesToPixelStrips(cropZones, imgWidth, imgHeight) {
  const zones = Array.isArray(cropZones) ? cropZones.slice() : []
  const w = Math.max(1, Number(imgWidth) || 1)
  const h = Math.max(1, Number(imgHeight) || 1)
  const sorted = zones.slice().sort(function(a, b) {
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0)
    if (dy !== 0) return dy
    return (Number(a.x) || 0) - (Number(b.x) || 0)
  })
  return sorted.map(function(zone) {
    const x = Math.max(0, Math.min(w - 1, Math.round((Number(zone.x) || 0) / 100 * w)))
    const y = Math.max(0, Math.min(h - 1, Math.round((Number(zone.y) || 0) / 100 * h)))
    const zw = Math.max(1, Math.min(w - x, Math.round((Number(zone.width) || 0) / 100 * w)))
    const zh = Math.max(1, Math.min(h - y, Math.round((Number(zone.height) || 0) / 100 * h)))
    return { x: x, y: y, w: zw, h: zh }
  })
}

/**
 * Build a JPEG containing only the selected crop-zone pixels, stitched vertically.
 * Zones are %-normalized (x,y,width,height of the source crop).
 * @returns {Promise<Blob>}
 */
export async function buildZonesOnlyBlob(cropBlob, cropZones, options) {
  const zones = Array.isArray(cropZones) ? cropZones.slice() : []
  if (!cropBlob) throw new Error('Crop is required')
  if (!zones.length) throw new Error('At least one crop zone is required')
  const opts = options || {}
  const gap = opts.gap == null ? 8 : Math.max(0, Number(opts.gap) || 0)
  const img = await loadImageFromBlob(cropBlob)
  const strips = cropZonesToPixelStrips(zones, img.width, img.height)

  const outWidth = Math.max.apply(null, strips.map(function(s) { return s.w }))
  let outHeight = 0
  strips.forEach(function(s, i) {
    outHeight += s.h
    if (i < strips.length - 1) outHeight += gap
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, outWidth)
  canvas.height = Math.max(1, outHeight)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  let dy = 0
  strips.forEach(function(s, i) {
    ctx.drawImage(img, s.x, s.y, s.w, s.h, 0, dy, s.w, s.h)
    dy += s.h
    if (i < strips.length - 1) dy += gap
  })

  return canvasToJpegBlob(canvas)
}

/**
 * Rebuild a missing crop from the persisted source PDF + page/bbox.
 * Used when IndexedDB still has the PDF but the crop blob was evicted.
 */
export async function rehydrateCropBlobFromPdf(tune, pdfBlob, options) {
  if (!tune || !pdfBlob) return null
  const opts = options || {}
  const page = Number(tune.sourcePdfPage || tune.page) || 1
  const scale = Number(tune.rasterScale) > 0 ? Number(tune.rasterScale) : (opts.scale || 2)
  const rendered = await rasterizePdfPageToPng(pdfBlob, page, {
    scale: scale,
    signal: opts.signal,
  })
  if (!rendered || !rendered.blob) return null
  const bbox = tune.bbox
  if (!bbox || !(Number(bbox.height) > 0)) {
    return rendered.blob
  }
  const img = await loadImageFromBlob(rendered.blob)
  const x = Math.max(0, Math.floor(Number(bbox.x) || 0))
  const y = Math.max(0, Math.floor(Number(bbox.y) || 0))
  const w = Math.max(1, Math.floor(Number(bbox.width) || img.width))
  const h = Math.max(1, Math.floor(Number(bbox.height) || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.min(w, Math.max(1, img.width - x)))
  canvas.height = Math.max(1, Math.min(h, Math.max(1, img.height - y)))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
  return canvasToJpegBlob(canvas)
}
