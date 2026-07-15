/**
 * Tunebook YouTube Helper — MV3 service worker.
 * Resolves YouTube audio via Innertube (Android/iOS clients) and streams
 * chunked base64 to the content script over a long-lived port.
 */

const EXTENSION_VERSION = '0.1.1'
const CHUNK_CHARS = 240000

const INNERTUBE_CLIENTS = [
  {
    name: 'ANDROID',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '20.10.38',
    },
  },
  {
    name: 'IOS',
    apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '17.5.1.21F90',
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'User-Agent': 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '20.10.4',
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

function pickAudioFormat(streamingData) {
  const formats = []
    .concat((streamingData && streamingData.adaptiveFormats) || [])
    .concat((streamingData && streamingData.formats) || [])
  const audioOnly = formats.filter(function (f) {
    if (!f || !f.url) return false
    if (f.signatureCipher || f.cipher) return false
    const mime = String(f.mimeType || '')
    return mime.indexOf('audio/') === 0 || (f.audioQuality && !f.width)
  })
  audioOnly.sort(function (a, b) {
    return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
  })
  return audioOnly[0] || null
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
      const format = pickAudioFormat(player.streamingData)
      if (!format || !format.url) {
        lastError = new Error('No progressive audio URL from ' + client.name)
        continue
      }
      const audioResponse = await fetch(format.url)
      if (!audioResponse.ok) {
        lastError = new Error('Audio fetch HTTP ' + audioResponse.status)
        continue
      }
      const buffer = await audioResponse.arrayBuffer()
      const mime = String(format.mimeType || 'audio/mp4').split(';')[0].trim()
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
  if (!port || port.name !== 'tunebook-yt') return

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
          message: err && err.message ? String(err.message) : 'Fetch failed',
        })
      })
  })
})
