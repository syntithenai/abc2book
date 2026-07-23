export const DEFAULT_EXPORT_METADATA = {
  title: '',
  artist: '',
  album: '',
  trackNumber: '',
  year: '',
  genre: '',
  comments: '',
  custom: [],
}

export function normalizeExportMetadata(raw) {
  const m = raw || {}
  return {
    title: String(m.title || ''),
    artist: String(m.artist || ''),
    album: String(m.album || ''),
    trackNumber: String(m.trackNumber || ''),
    year: String(m.year || ''),
    genre: String(m.genre || ''),
    comments: String(m.comments || ''),
    custom: Array.isArray(m.custom) ? m.custom.map(function(row) {
      return { tag: String(row.tag || ''), value: String(row.value || '') }
    }) : [],
  }
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true)
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

export function appendWavInfoChunk(wavArrayBuffer, metadata) {
  const meta = normalizeExportMetadata(metadata)
  const entries = []
  if (meta.title) entries.push(['INAM', meta.title])
  if (meta.artist) entries.push(['IART', meta.artist])
  if (meta.comments) entries.push(['ICMT', meta.comments])
  if (meta.year) entries.push(['ICRD', meta.year])
  if (meta.genre) entries.push(['IGNR', meta.genre])
  meta.custom.forEach(function(row) {
    if (row.tag && row.value) entries.push([row.tag.slice(0, 4).toUpperCase(), row.value])
  })
  if (!entries.length) return wavArrayBuffer

  let listBodySize = 4
  entries.forEach(function(entry) {
    const bytes = new TextEncoder().encode(entry[1])
    listBodySize += 8 + bytes.length + (bytes.length % 2)
  })
  const chunk = new ArrayBuffer(8 + listBodySize)
  const view = new DataView(chunk)
  writeString(view, 0, 'LIST')
  writeUint32(view, 4, listBodySize)
  writeString(view, 8, 'INFO')
  let pos = 12
  entries.forEach(function(entry) {
    const bytes = new TextEncoder().encode(entry[1])
    writeString(view, pos, entry[0])
    writeUint32(view, pos + 4, bytes.length)
    for (let i = 0; i < bytes.length; i += 1) view.setUint8(pos + 8 + i, bytes[i])
    pos += 8 + bytes.length + (bytes.length % 2)
  })

  const orig = new Uint8Array(wavArrayBuffer)
  const extra = new Uint8Array(chunk)
  const out = new Uint8Array(orig.length + extra.length)
  out.set(orig.subarray(0, 4))
  const origSize = new DataView(wavArrayBuffer).getUint32(4, true)
  const merged = new DataView(out.buffer)
  merged.setUint32(4, origSize + extra.length, true)
  out.set(orig.subarray(8), 8)
  out.set(extra, orig.length)
  return out.buffer
}

function encodeSyncsafeInt(value) {
  const bytes = [0, 0, 0, 0]
  bytes[0] = (value >>> 21) & 0x7f
  bytes[1] = (value >>> 14) & 0x7f
  bytes[2] = (value >>> 7) & 0x7f
  bytes[3] = value & 0x7f
  return bytes
}

function id3Frame(frameId, text) {
  const enc = new TextEncoder().encode(text)
  const frame = new Uint8Array(10 + 1 + enc.length)
  for (let i = 0; i < 4; i += 1) frame[i] = frameId.charCodeAt(i)
  const size = 1 + enc.length
  frame[4] = (size >>> 24) & 0xff
  frame[5] = (size >>> 16) & 0xff
  frame[6] = (size >>> 8) & 0xff
  frame[7] = size & 0xff
  frame[10] = 0
  frame.set(enc, 11)
  return frame
}

export function appendId3v2ToMp3(mp3Blob, metadata) {
  const meta = normalizeExportMetadata(metadata)
  const frames = []
  if (meta.title) frames.push(id3Frame('TIT2', meta.title))
  if (meta.artist) frames.push(id3Frame('TPE1', meta.artist))
  if (meta.album) frames.push(id3Frame('TALB', meta.album))
  if (meta.year) frames.push(id3Frame('TYER', meta.year))
  if (meta.genre) frames.push(id3Frame('TCON', meta.genre))
  if (meta.comments) frames.push(id3Frame('COMM', meta.comments))
  if (meta.trackNumber) frames.push(id3Frame('TRCK', meta.trackNumber))
  if (!frames.length) return mp3Blob

  let bodyLen = 0
  frames.forEach(function(f) { bodyLen += f.length })
  const header = new Uint8Array(10)
  header[0] = 0x49
  header[1] = 0x44
  header[2] = 0x33
  header[3] = 3
  const sizeBytes = encodeSyncsafeInt(bodyLen)
  header[6] = sizeBytes[0]
  header[7] = sizeBytes[1]
  header[8] = sizeBytes[2]
  header[9] = sizeBytes[3]

  return new Blob([header].concat(frames, [mp3Blob]), { type: 'audio/mpeg' })
}
