import { fetchViaMediaProxy, normalizeAccessToken } from './mediaProxyClient'

function metadataAuthErrorMessage(error) {
  const message = String(error && error.message || '')
  if (message.indexOf('401') >= 0
    || message.indexOf('Bearer token') >= 0
    || message.indexOf('login_required') >= 0) {
    return 'Log in with Google to read titles from scanned sheet music.'
  }
  return message
}

const PROBE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function probePngFile() {
  const bytes = Uint8Array.from(atob(PROBE_PNG_BASE64), function(ch) {
    return ch.charCodeAt(0)
  })
  return new File([bytes], 'sheet-metadata-probe.png', { type: 'image/png' })
}

export function normalizeSheetMetadataBody(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned invalid sheet metadata')
  }
  if (body.error) {
    throw new Error(body.error)
  }
  const segments = Array.isArray(body.segments) ? body.segments.map(function(segment) {
    return {
      page: Number(segment && segment.page) || 1,
      endPage: Number(segment && segment.endPage) || Number(segment && segment.page) || 1,
      title: String(segment && segment.title || '').trim(),
      composer: String(segment && (segment.artist || segment.composer) || '').trim(),
    }
  }) : []
  const pageTitles = Array.isArray(body.pageTitles) ? body.pageTitles.map(function(entry) {
    return {
      page: Number(entry && entry.page) || 1,
      title: String(entry && entry.title || '').trim(),
      artist: String(entry && entry.artist || '').trim(),
      lines: Array.isArray(entry && entry.lines) ? entry.lines.slice() : [],
    }
  }) : []
  const warnings = Array.isArray(body.warnings) ? body.warnings.slice() : []
  return {
    numPages: Number(body.numPages) || pageTitles.length || 1,
    segments: segments,
    pageTitles: pageTitles,
    warnings: warnings,
  }
}

export async function probeSheetMetadataEndpoint(options) {
  if (!options || !options.resolverAvailable) {
    return {
      ok: false,
      reason: 'Media resolver is not available. Titles will come from filenames and folder names.',
    }
  }
  try {
    await extractSheetMetadataFile({
      file: probePngFile(),
      accessToken: options.accessToken,
    })
    return { ok: true, reason: '' }
  } catch (e) {
    const message = metadataAuthErrorMessage(e) || 'Sheet metadata extraction is unavailable'
    const suffix = message.indexOf('Log in with Google') === 0
      ? ' Titles will come from filenames and folder names until you log in.'
      : '. Titles will come from filenames and folder names until the resolver is restarted.'
    return {
      ok: false,
      reason: message + suffix,
    }
  }
}

export async function extractSheetMetadataFile(options) {
  const file = options && options.file
  if (!file) throw new Error('No file selected')

  const formData = new FormData()
  formData.append('file', file, file.name || 'sheet.pdf')
  const composerHint = String(options && options.composerHint || '').trim()
  if (composerHint) formData.append('composerHint', composerHint)

  const response = await fetchViaMediaProxy(
    '/extract-sheet-metadata',
    normalizeAccessToken(options && options.accessToken),
    {
      method: 'POST',
      body: formData,
    }
  )

  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (contentType.indexOf('application/json') < 0) {
    throw new Error('Sheet metadata extraction failed')
  }

  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable metadata response')
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Sheet metadata extraction failed')
  }
  return normalizeSheetMetadataBody(body)
}
