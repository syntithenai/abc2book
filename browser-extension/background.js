/**
 * TuneBook Helper — MV3 service worker.
 * Resolves YouTube audio via Innertube clients and streams
 * chunked base64 to the content script over a long-lived port.
 */

const EXTENSION_VERSION = '0.1.9'
const CHUNK_CHARS = 240000
// googlevideo throttles un-ranged progressive downloads to ~playback speed;
// ranged requests (like yt-dlp uses) download at full speed.
const RANGE_CHUNK_BYTES = 10 * 1024 * 1024
const MAX_PAGE_HTML_CHARS = 2500000
const PAGE_HTML_HOST_ALLOWLIST = [
  'tabs.ultimate-guitar.com',
  'ultimate-guitar.com',
  'www.ultimate-guitar.com',
]

// Prefer ANDROID_VR first; DASH itag 251 now 403s, so we also try muxed format 18.
// Keep IOS/ANDROID as fallbacks with current client versions from yt-dlp.
const INNERTUBE_CLIENTS = [
  {
    name: 'ANDROID_VR',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.65.10',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'User-Agent':
        'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      'X-YouTube-Client-Name': '28',
      'X-YouTube-Client-Version': '1.65.10',
      'X-Goog-Api-Key': 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
  },
  {
    name: 'IOS',
    apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '21.26.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.3.2.22D82',
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'User-Agent':
        'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '21.26.4',
      'X-Goog-Api-Key': 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
  },
  {
    name: 'ANDROID',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 34,
        osName: 'Android',
        osVersion: '14',
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '20.10.38',
      'X-Goog-Api-Key': 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
  },
]

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function isDownloadableUrlFormat(format) {
  if (!format || !format.url) return false
  if (format.signatureCipher || format.cipher) return false
  return true
}

function isAudioOnlyFormat(format) {
  const mime = String(format.mimeType || '')
  return mime.indexOf('audio/') === 0 || (format.audioQuality && !format.width)
}

function pickAudioFormats(streamingData) {
  const adaptive = (streamingData && streamingData.adaptiveFormats) || []
  const progressive = (streamingData && streamingData.formats) || []
  const all = adaptive.concat(progressive)
  const audioOnly = all.filter(function (format) {
    return isDownloadableUrlFormat(format) && isAudioOnlyFormat(format)
  })
  audioOnly.sort(function (a, b) {
    return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
  })
  // android_vr DASH (251 etc.) now 403s without a GVS PO token; muxed 360p still works.
  const muxed = progressive.filter(function (format) {
    return isDownloadableUrlFormat(format) && (format.audioQuality || format.audioSampleRate)
  })
  muxed.sort(function (a, b) {
    return (Number(a.width) || 9999) - (Number(b.width) || 9999)
  })
  const seen = {}
  const out = []
  audioOnly.concat(muxed).forEach(function (format) {
    const key = String(format.itag || format.url)
    if (seen[key]) return
    seen[key] = true
    out.push(format)
  })
  return out
}

function parseTotalFromContentRange(contentRange) {
  const match = /\/(\d+)\s*$/.exec(String(contentRange || ''))
  return match ? Number(match[1]) : 0
}

async function fetchRange(url, headers, start, end) {
  const response = await fetch(url, {
    headers: Object.assign({}, headers, { Range: 'bytes=' + start + '-' + end }),
  })
  if (!response.ok) {
    throw new Error('Ranged audio fetch HTTP ' + response.status)
  }
  const buffer = await response.arrayBuffer()
  return {
    status: response.status,
    buffer: buffer,
    contentRange: response.headers.get('Content-Range'),
  }
}

async function downloadAudioBytesRanged(url, headers, declaredTotal) {
  const parts = []
  let received = 0
  let total = declaredTotal > 0 ? declaredTotal : 0
  for (;;) {
    const start = received
    const part = await fetchRange(url, headers, start, start + RANGE_CHUNK_BYTES - 1)
    if (part.status !== 206) {
      if (start === 0) {
        // Server ignored the Range header and sent the whole body.
        return part.buffer
      }
      throw new Error('Ranged audio fetch lost range support mid-download')
    }
    parts.push(new Uint8Array(part.buffer))
    received += part.buffer.byteLength
    if (!total) {
      total = parseTotalFromContentRange(part.contentRange)
    }
    if (total && received >= total) break
    if (part.buffer.byteLength < RANGE_CHUNK_BYTES) break
    if (part.buffer.byteLength === 0) break
  }
  const assembled = new Uint8Array(received)
  let offset = 0
  for (let i = 0; i < parts.length; i++) {
    assembled.set(parts[i], offset)
    offset += parts[i].byteLength
  }
  return assembled.buffer
}

async function resolvePlayer(videoId, client) {
  const url =
    'https://www.youtube.com/youtubei/v1/player?key=' +
    encodeURIComponent(client.apiKey) +
    '&prettyPrint=false'
  const response = await fetch(url, {
    method: 'POST',
    headers: Object.assign(
      {
        'Content-Type': 'application/json',
      },
      client.headers
    ),
    body: JSON.stringify({
      context: client.context,
      videoId: videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  })
  if (!response.ok) {
    throw new Error('Innertube player HTTP ' + response.status + ' (' + client.name + ')')
  }
  return response.json()
}

async function fetchYoutubeAudioBytes(videoId) {
  let lastError = null
  for (let i = 0; i < INNERTUBE_CLIENTS.length; i++) {
    const client = INNERTUBE_CLIENTS[i]
    try {
      const player = await resolvePlayer(videoId, client)
      const playability = player && player.playabilityStatus
      if (playability && playability.status && playability.status !== 'OK') {
        lastError = new Error(
          'Playability ' +
            playability.status +
            (playability.reason ? ': ' + playability.reason : '')
        )
        continue
      }
      const formats = pickAudioFormats(player.streamingData)
      if (!formats.length) {
        lastError = new Error('No progressive audio URL from ' + client.name)
        continue
      }
      const audioHeaders = {
        'User-Agent': client.headers['User-Agent'],
        Referer: 'https://www.youtube.com/',
      }
      let buffer = null
      let format = null
      for (let fi = 0; fi < formats.length; fi++) {
        format = formats[fi]
        try {
          buffer = await downloadAudioBytesRanged(
            format.url,
            audioHeaders,
            Number(format.contentLength) || 0
          )
        } catch (rangeError) {
          try {
            const audioResponse = await fetch(format.url, { headers: audioHeaders })
            if (!audioResponse.ok) {
              lastError = new Error(
                'Audio fetch HTTP ' + audioResponse.status + ' (' + client.name + ')'
              )
              buffer = null
              continue
            }
            buffer = await audioResponse.arrayBuffer()
          } catch (fetchError) {
            lastError = fetchError
            buffer = null
            continue
          }
        }
        if (buffer && buffer.byteLength >= 1024) break
        buffer = null
      }
      if (!buffer || buffer.byteLength < 1024) {
        lastError = lastError || new Error('Empty audio from ' + client.name)
        continue
      }
      const mime = String((format && format.mimeType) || 'audio/mp4').split(';')[0].trim()
      return {
        buffer: buffer,
        mime: mime,
        client: client.name,
        title:
          player && player.videoDetails && player.videoDetails.title
            ? String(player.videoDetails.title)
            : null,
      }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Could not resolve YouTube audio')
}

function isAllowedPageHtmlHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^www\./, '')
  if (!host) return false
  for (let i = 0; i < PAGE_HTML_HOST_ALLOWLIST.length; i++) {
    const allowed = PAGE_HTML_HOST_ALLOWLIST[i].replace(/^www\./, '')
    if (host === allowed || host.endsWith('.' + allowed)) return true
  }
  return false
}

function assertAllowedPageHtmlUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(String(rawUrl || '').trim())
  } catch (e) {
    throw new Error('Invalid page URL')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Page URL must be http(s)')
  }
  if (!isAllowedPageHtmlHost(parsed.hostname)) {
    throw new Error('Host is not allowlisted for page HTML fetch')
  }
  return parsed.href
}

async function fetchPageHtml(rawUrl) {
  const url = assertAllowedPageHtmlUrl(rawUrl)
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  const html = await response.text()
  if (!response.ok) {
    throw new Error('Page fetch HTTP ' + response.status)
  }
  if (!html || !String(html).trim()) {
    throw new Error('Empty page HTML')
  }
  if (html.length > MAX_PAGE_HTML_CHARS) {
    throw new Error('Page HTML too large')
  }
  return {
    html: html,
    finalUrl: response.url || url,
    status: response.status,
  }
}

function postAudioOverPort(port, requestId, payload) {
  const base64 = arrayBufferToBase64(payload.buffer)
  const total = Math.max(1, Math.ceil(base64.length / CHUNK_CHARS))
  port.postMessage({
    type: 'tunebook.audioMeta',
    requestId: requestId,
    mime: payload.mime,
    byteLength: payload.buffer.byteLength,
    title: payload.title,
    client: payload.client,
    totalChunks: total,
  })
  for (let index = 0; index < total; index++) {
    port.postMessage({
      type: 'tunebook.audioChunk',
      requestId: requestId,
      index: index,
      total: total,
      base64: base64.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS),
    })
  }
  port.postMessage({
    type: 'tunebook.audioDone',
    requestId: requestId,
  })
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message !== 'object') return false

  if (message.type === 'tunebook.ping') {
    sendResponse({
      type: 'tunebook.pong',
      version: EXTENSION_VERSION,
      extensionId: chrome.runtime.id,
    })
    return false
  }

  return false
})

chrome.runtime.onConnect.addListener(function (port) {
  if (!port) return

  if (port.name === 'tunebook-ping') {
    port.onMessage.addListener(function (message) {
      if (!message || message.type !== 'tunebook.ping') return
      port.postMessage({
        type: 'tunebook.pong',
        version: EXTENSION_VERSION,
        extensionId: chrome.runtime.id,
        ok: true,
      })
      try {
        port.disconnect()
      } catch (e) {
        // ignore
      }
    })
    return
  }

  if (port.name === 'tunebook-page-html') {
    port.onMessage.addListener(function (message) {
      if (!message || message.type !== 'tunebook.fetchPageHtml') return
      const requestId = message.requestId
      const pageUrl = message.url
      fetchPageHtml(pageUrl)
        .then(function (payload) {
          port.postMessage({
            type: 'tunebook.pageHtml',
            requestId: requestId,
            html: payload.html,
            finalUrl: payload.finalUrl,
            status: payload.status,
          })
        })
        .catch(function (err) {
          port.postMessage({
            type: 'tunebook.pageHtmlError',
            requestId: requestId,
            code: 'fetch_failed',
            message: err && err.message ? String(err.message) : 'Page HTML fetch failed',
          })
        })
    })
    return
  }

  if (port.name !== 'tunebook-yt') return

  port.onMessage.addListener(function (message) {
    if (!message || message.type !== 'tunebook.fetchYoutubeAudio') return
    const videoId = String(message.videoId || '').trim()
    const requestId = message.requestId
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      port.postMessage({
        type: 'tunebook.audioError',
        requestId: requestId,
        code: 'invalid_video_id',
        message: 'Invalid YouTube video id',
      })
      return
    }
    fetchYoutubeAudioBytes(videoId)
      .then(function (payload) {
        postAudioOverPort(port, requestId, payload)
      })
      .catch(function (err) {
        port.postMessage({
          type: 'tunebook.audioError',
          requestId: requestId,
          code: 'fetch_failed',
          message: err && err.message ? String(err.message) : 'YouTube audio fetch failed',
        })
      })
  })
})
