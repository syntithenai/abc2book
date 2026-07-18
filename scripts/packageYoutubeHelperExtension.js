#!/usr/bin/env node
/**
 * Packages browser-extension/ into
 * public/downloads/tunebook-helper.zip
 * with a single top-level folder for Chrome "Load unpacked".
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'browser-extension')
const OUT_DIR = path.join(ROOT, 'public', 'downloads')
const OUT_ZIP = path.join(OUT_DIR, 'tunebook-helper.zip')
const ZIP_ROOT = 'tunebook-helper'
const LEGACY_OUT_ZIP = path.join(OUT_DIR, 'tunebook-youtube-helper.zip')

const EXCLUDE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.git',
  '.gitignore',
])

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function listFiles(dir, baseRel) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (let i = 0; i < entries.length; i++) {
    const ent = entries[i]
    if (EXCLUDE_NAMES.has(ent.name)) continue
    if (ent.name.startsWith('.')) continue
    const abs = path.join(dir, ent.name)
    const rel = baseRel ? baseRel + '/' + ent.name : ent.name
    if (ent.isDirectory()) {
      files.push.apply(files, listFiles(abs, rel))
    } else if (ent.isFile()) {
      files.push({ abs: abs, rel: rel })
    }
  }
  return files
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0, 0)
  return b
}

function dosDateTime(date) {
  const d = date || new Date()
  const dosTime =
    (d.getSeconds() >> 1) | (d.getMinutes() << 5) | (d.getHours() << 11)
  const dosDate =
    d.getDate() | ((d.getMonth() + 1) << 5) | ((d.getFullYear() - 1980) << 9)
  return { dosTime: dosTime, dosDate: dosDate }
}

function buildZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  const when = dosDateTime(new Date())

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const data = fs.readFileSync(file.abs)
    const name = ZIP_ROOT + '/' + file.rel.replace(/\\/g, '/')
    const nameBuf = Buffer.from(name, 'utf8')
    const compressed = zlib.deflateRawSync(data)
    const useStore = compressed.length >= data.length
    const payload = useStore ? data : compressed
    const method = useStore ? 0 : 8
    const crc = crc32(data)

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(method),
      u16(when.dosTime),
      u16(when.dosDate),
      u32(crc),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
    ])

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(method),
      u16(when.dosTime),
      u16(when.dosDate),
      u32(crc),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ])

    localParts.push(localHeader, payload)
    centralParts.push(centralHeader)
    offset += localHeader.length + payload.length
  }

  const central = Buffer.concat(centralParts)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])

  return Buffer.concat(localParts.concat([central, end]))
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('Missing source directory:', SRC_DIR)
    process.exit(1)
  }
  const manifestPath = path.join(SRC_DIR, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error('Missing manifest.json in', SRC_DIR)
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const files = listFiles(SRC_DIR, '')
  if (files.length === 0) {
    console.error('No files to package in', SRC_DIR)
    process.exit(1)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const zipBuf = buildZip(files)
  fs.writeFileSync(OUT_ZIP, zipBuf)
  if (fs.existsSync(LEGACY_OUT_ZIP)) {
    fs.unlinkSync(LEGACY_OUT_ZIP)
  }
  console.log(
    'Packaged TuneBook Helper v' +
      (manifest.version || '?') +
      ' (' +
      files.length +
      ' files) → ' +
      path.relative(ROOT, OUT_ZIP)
  )
}

main()
