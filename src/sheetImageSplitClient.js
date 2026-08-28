import { fetchViaMediaProxy, normalizeAccessToken } from './mediaProxyClient'

function splitAuthErrorMessage(error) {
  const message = String(error && error.message || '')
  if (message.indexOf('401') >= 0
    || message.indexOf('Bearer token') >= 0
    || message.indexOf('login_required') >= 0) {
    return 'Log in with Google to split sheet music pages.'
  }
  return message
}

/**
 * @param {object} body
 * @returns {{ page: number, width: number, height: number, pageJpegBase64: string, segments: object[], splitMethod: string, warnings: string[] }}
 */
export function normalizeSheetSplitBody(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned invalid sheet split response')
  }
  if (body.error) {
    throw new Error(body.error)
  }
  const segments = Array.isArray(body.segments) ? body.segments.map(function(segment, index) {
    const top = Number(segment && segment.top) || 0
    const bottom = Number(segment && segment.bottom) || top + 1
    return {
      title: String(segment && segment.title || '').trim(),
      tuneIndex: Number(segment && segment.tuneIndex) || (index + 1),
      slug: String(segment && segment.slug || '').trim(),
      top: top,
      bottom: bottom,
      bbox: segment && segment.bbox
        ? {
          x: Number(segment.bbox.x) || 0,
          y: Number(segment.bbox.y) || top,
          width: Number(segment.bbox.width) || 0,
          height: Number(segment.bbox.height) || Math.max(1, bottom - top),
        }
        : { x: 0, y: top, width: 0, height: Math.max(1, bottom - top) },
      systemTop: segment && segment.systemTop != null ? Number(segment.systemTop) : null,
      systemBottom: segment && segment.systemBottom != null ? Number(segment.systemBottom) : null,
      cropJpegBase64: String(segment && segment.cropJpegBase64 || '').trim(),
    }
  }) : []
  return {
    page: Number(body.page) || 1,
    width: Number(body.width) || 0,
    height: Number(body.height) || 0,
    pageJpegBase64: String(body.pageJpegBase64 || '').trim(),
    splitMethod: String(body.splitMethod || '').trim(),
    systemCount: Number(body.systemCount) || 0,
    segments: segments,
    warnings: Array.isArray(body.warnings) ? body.warnings.slice() : [],
  }
}

export function jpegBase64ToBlob(base64, mime) {
  const raw = String(base64 || '').trim()
  if (!raw) return null
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime || 'image/jpeg' })
}

/**
 * @param {{ file: File|Blob, accessToken?: string, page?: number, fileName?: string, signal?: AbortSignal }} options
 */
export async function splitSheetPageFile(options) {
  const file = options && options.file
  if (!file) throw new Error('Missing image file')
  const accessToken = normalizeAccessToken(options.accessToken)
  const form = new FormData()
  const fileName = options.fileName
    || (file && file.name)
    || 'page.jpg'
  form.append('file', file, fileName)
  if (options.page != null) {
    form.append('page', String(options.page))
  }
  let response
  try {
    response = await fetchViaMediaProxy('/split-sheet-page', accessToken, {
      method: 'POST',
      body: form,
      signal: options.signal,
    })
  } catch (e) {
    throw new Error(splitAuthErrorMessage(e) || String(e && e.message || e))
  }
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable sheet split response')
  }
  if (!response.ok) {
    const detail = body && (body.detail || body.error || body.message)
    throw new Error(String(detail || ('Sheet split failed (' + response.status + ')')))
  }
  return normalizeSheetSplitBody(body)
}
