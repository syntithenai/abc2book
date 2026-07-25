#!/usr/bin/env node
/**
 * Extract curated drum groove presets from assets/drum-template.mid.
 * Run: node scripts/extractDrumPresets.mjs [--json]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIDI_PATH = path.join(__dirname, '..', 'assets', 'drum-template.mid')

const METER_CONFIGS = [
  {
    id: '4-4',
    labelPrefix: 'Rock',
    beatsPerBar: 4,
    pulsesPerBeat: [4, 4, 4, 4],
    barTicks: (div) => div * 4,
    slots: 16,
    count: 6,
    category: 'Rock & pop',
  },
  {
    id: '6-8',
    labelPrefix: 'Jig',
    beatsPerBar: 2,
    pulsesPerBeat: [3, 3],
    barTicks: (div) => div * 3,
    slots: 6,
    count: 3,
    category: 'Folk & dance',
  },
  {
    id: '3-4',
    labelPrefix: 'Waltz',
    beatsPerBar: 3,
    pulsesPerBeat: [1, 1, 1],
    barTicks: (div) => div * 3,
    slots: 3,
    count: 2,
    category: 'Folk & dance',
  },
  {
    id: '2-4',
    labelPrefix: 'Reel',
    beatsPerBar: 2,
    pulsesPerBeat: [2, 2],
    barTicks: (div) => div * 2,
    slots: 4,
    count: 2,
    category: 'Folk & dance',
  },
  {
    id: '12-8',
    labelPrefix: 'Shuffle',
    beatsPerBar: 4,
    pulsesPerBeat: [3, 3, 3, 3],
    barTicks: (div) => div * 6,
    slots: 12,
    count: 2,
    category: 'Folk & dance',
  },
]

function readVarInt(data, pos) {
  let value = 0
  while (pos < data.length) {
    const b = data[pos]
    pos += 1
    value = (value << 7) | (b & 0x7f)
    if (!(b & 0x80)) break
  }
  return [value, pos]
}

function parseNotes(trkdata) {
  const notes = []
  let t = 0
  let ip = 0
  let status = null
  while (ip < trkdata.length) {
    let delta
    ;[delta, ip] = readVarInt(trkdata, ip)
    t += delta
    if (ip >= trkdata.length) break
    const b = trkdata[ip]
    if (b < 0x80) {
      if (status === null) {
        ip += 1
        continue
      }
    } else {
      status = b
      ip += 1
    }
    const cmd = status & 0xf0
    if (cmd === 0x90) {
      const note = trkdata[ip]
      const vel = trkdata[ip + 1]
      ip += 2
      if (vel > 0) notes.push([t, note, vel])
    } else if (cmd === 0x80) {
      ip += 2
    } else if (cmd === 0xff) {
      const meta = trkdata[ip]
      ip += 1
      let ln
      ;[ln, ip] = readVarInt(trkdata, ip)
      ip += ln
      void meta
    } else if (cmd === 0xc0 || cmd === 0xd0) {
      ip += 1
    } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
      ip += 2
    } else if (cmd === 0xf0) {
      let ln
      ;[ln, ip] = readVarInt(trkdata, ip)
      ip += ln
    }
  }
  return notes
}

function parseMidi(data) {
  let pos = 4
  const hdrlen = data.readUInt32BE(pos)
  pos += 4
  const fmt = data.readUInt16BE(pos)
  const ntrks = data.readUInt16BE(pos + 2)
  const div = data.readUInt16BE(pos + 4)
  pos += 6 + (hdrlen - 6)
  const tracks = []
  for (let ti = 0; ti < ntrks; ti += 1) {
    pos += 4
    const trklen = data.readUInt32BE(pos)
    pos += 4
    tracks.push(parseNotes(data.subarray(pos, pos + trklen)))
    pos += trklen
  }
  return { fmt, div, tracks }
}

function classify(note) {
  if (note === 35 || note === 36) return 'kick'
  if (note === 38 || note === 40) return 'snare'
  if (note === 37 || note === 39) return 'rim'
  if (note === 42 || note === 44 || note === 46) return 'hat'
  if (note === 41 || note === 43 || note === 45 || note === 47 || note === 48 || note === 50) return 'tom'
  if (note >= 49) return 'cymbal'
  return null
}

function barPattern(barNotes, barStart, slots, barTicks) {
  const hits = {}
  const slotTicks = barTicks / slots
  barNotes.forEach(function([t, note]) {
    const cls = classify(note)
    if (!cls || cls === 'cymbal') return
    const slot = Math.round((t - barStart) / slotTicks) % slots
    if (!hits[cls]) hits[cls] = new Set()
    hits[cls].add(slot)
  })
  const out = {}
  Object.keys(hits).forEach(function(key) {
    out[key] = Array.from(hits[key]).sort(function(a, b) { return a - b })
  })
  return out
}

function density(pattern) {
  return Object.keys(pattern).reduce(function(sum, key) {
    return sum + pattern[key].length
  }, 0)
}

function scorePattern(pattern, config) {
  const slots = config.slots
  const tracks = Object.keys(pattern)
  const dens = density(pattern)
  let score = 0
  if (pattern.kick) score += 2
  if (pattern.snare) score += 2
  if (pattern.hat) score += 1
  if (dens <= 8) score += 2
  else if (dens <= 12) score += 1
  if (pattern.tom) score -= 2
  if (pattern.rim && !pattern.snare) score -= 1

  if (config.id === '4-4') {
    if (pattern.snare && pattern.snare.includes(4) && pattern.snare.includes(12)) score += 2
  } else if (config.id === '6-8') {
    const sn = pattern.snare || []
    const kick = pattern.kick || []
    if (sn.includes(2) || sn.includes(5)) score += 3
    if (kick.includes(0) || kick.includes(3)) score += 2
    if (dens < 2) score -= 4
  } else if (config.id === '3-4') {
    const sn = pattern.snare || []
    const kick = pattern.kick || []
    if (kick.includes(0) && sn.includes(1)) score += 4
    if (dens === 3 && kick.length === 1 && sn.length === 1 && kick[0] !== sn[0]) score += 2
    const allBeats = new Set([].concat(kick, sn, pattern.hat || [], pattern.rim || []))
    if (allBeats.size < 2) score -= 5
  } else if (config.id === '2-4') {
    const sn = pattern.snare || []
    const kick = pattern.kick || []
    if (sn.includes(2)) score += 3
    if (kick.includes(0)) score += 2
  } else if (config.id === '12-8') {
    const sn = pattern.snare || []
    if (sn.includes(3) && sn.includes(9)) score += 3
    if (sn.includes(3) || sn.includes(9)) score += 1
  }

  return score
}

function signature(pattern) {
  return JSON.stringify(
    Object.keys(pattern).sort().map(function(key) {
      return [key, pattern[key]]
    })
  )
}

function skeleton(pattern) {
  return JSON.stringify([
    pattern.kick || [],
    pattern.snare || [],
  ])
}

function uniquePatterns(notes, config, div, start0) {
  const barTicks = config.barTicks(div)
  const phaseOffsets = config.id === '4-4' ? [0] : Array.from({ length: Math.min(barTicks, 96) }, function(_, i) { return i })
  const seen = new Set()
  const unique = []

  phaseOffsets.forEach(function(phase) {
    const origin = start0 + phase
    const chunks = new Map()
    notes.forEach(function([t, note, vel]) {
      void vel
      if (t < origin) return
      const bi = Math.floor((t - origin) / barTicks)
      if (!chunks.has(bi)) chunks.set(bi, [])
      chunks.get(bi).push([t, note, vel])
    })

    Array.from(chunks.keys()).sort(function(a, b) { return a - b }).forEach(function(bi) {
      const barStart = origin + bi * barTicks
      const pattern = barPattern(chunks.get(bi), barStart, config.slots, barTicks)
      if (!Object.keys(pattern).length) return
      const sig = signature(pattern)
      if (seen.has(sig)) return
      seen.add(sig)
      unique.push({
        barIndex: bi,
        phase: phase,
        pattern: pattern,
        score: scorePattern(pattern, config),
        density: density(pattern),
      })
    })
  })

  unique.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score
    return a.density - b.density
  })
  return unique
}

function selectDiverse(unique, count, minScore) {
  const selected = []
  const usedSkeletons = new Set()
  unique.forEach(function(item) {
    if (selected.length >= count) return
    if (item.score < minScore) return
    const skel = skeleton(item.pattern)
    if (usedSkeletons.has(skel)) return
    usedSkeletons.add(skel)
    selected.push(item)
  })
  return selected
}

const LABEL_SUFFIXES = [
  'backbeat',
  'light',
  'syncopated',
  'sparse',
  'driving',
  'steady',
  'shuffle',
  'bounce',
]

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function buildPreset(config, item, index) {
  const suffix = LABEL_SUFFIXES[index] || ('variant-' + (index + 1))
  const id = 'tpl-' + config.id.replace('/', '-') + '-' + suffix
  const label = config.labelPrefix + ' ' + suffix.replace(/-/g, ' ')
  return {
    id: id,
    label: label,
    category: config.category,
    beatsPerBar: config.beatsPerBar,
    pulsesPerBeat: config.pulsesPerBeat,
    trackHits: item.pattern,
    score: item.score,
    density: item.density,
    barIndex: item.barIndex,
  }
}

function formatTrackHits(trackHits) {
  const lines = Object.keys(trackHits).sort().map(function(key) {
    return '    ' + key + ': [' + trackHits[key].join(', ') + ']'
  })
  return '{\n' + lines.join(',\n') + '\n  }'
}

function formatJsPreset(preset) {
  const pulses = '[' + preset.pulsesPerBeat.join(', ') + ']'
  return [
    "  drumPreset('" + preset.id + "', '" + preset.label + "', PRESET_CATEGORY_" + categoryConst(preset.category) + ', ' + preset.beatsPerBar + ', ' + pulses + ', ',
    formatTrackHits(preset.trackHits) + '),',
  ].join('')
}

function categoryConst(category) {
  if (category === 'Rock & pop') return 'ROCK_POP'
  if (category === 'Folk & dance') return 'FOLK'
  return 'ROCK_POP'
}

function main() {
  const data = fs.readFileSync(MIDI_PATH)
  const { div, tracks } = parseMidi(data)
  const notes = tracks.flat().sort(function(a, b) { return a[0] - b[0] })
  if (!notes.length) {
    console.error('No notes found in', MIDI_PATH)
    process.exit(1)
  }
  const start0 = notes[0][0]
  const allPresets = []

  METER_CONFIGS.forEach(function(config) {
    const unique = uniquePatterns(notes, config, div, start0)
    const minScore = config.id === '4-4' ? 5 : 7
    const selected = selectDiverse(unique, config.count, minScore)
    selected.forEach(function(item, index) {
      allPresets.push(buildPreset(config, item, index))
    })
    console.error(
      config.id + ': ' + unique.length + ' unique bars, selected ' + selected.length
    )
  })

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(allPresets, null, 2))
    return
  }

  console.log('// Generated from assets/drum-template.mid — run: node scripts/extractDrumPresets.mjs')
  console.log('const TEMPLATE_DRUM_GROOVE_PRESETS = [')
  allPresets.forEach(function(preset) {
    console.log(formatJsPreset(preset))
  })
  console.log(']')
}

main()
