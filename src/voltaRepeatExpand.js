/**
 * Expand |: :| repeats and multi-number voltas (|1,3 … :|2,4 …)
 * into a linear element/token stream for playback.
 *
 * abcjs only treats startEnding === '1' and doubles once per :|, so
 * |1,3 / |2,4 collapses to the wrong pass order. This module plays
 * max(ending) passes, choosing the ending whose label includes each pass.
 */

export function parseVoltaPasses(startEnding) {
  const raw = String(startEnding || '').trim()
  if (!raw) return []
  const out = []
  const seen = {}
  raw.split(',').forEach(function(part) {
    const p = String(part || '').trim()
    if (!p) return
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(p)
    if (range) {
      const a = parseInt(range[1], 10)
      const b = parseInt(range[2], 10)
      if (!(a > 0 && b > 0)) return
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      for (let n = lo; n <= hi; n += 1) {
        if (!seen[n]) {
          seen[n] = true
          out.push(n)
        }
      }
      return
    }
    const n = parseInt(p, 10)
    if (n > 0 && !seen[n]) {
      seen[n] = true
      out.push(n)
    }
  })
  return out
}

function barTypeOf(el) {
  if (!el) return ''
  if (el.el_type === 'bar') return String(el.type || '')
  if (el.type === 'bar') return String(el.barType || '')
  return ''
}

function startEndingOf(el) {
  if (!el) return ''
  if (el.startEnding != null && String(el.startEnding) !== '') {
    return String(el.startEnding)
  }
  return ''
}

function isBar(el) {
  return !!(el && (el.el_type === 'bar' || el.type === 'bar'))
}

function isEndRepeat(barType) {
  return barType.indexOf('right_repeat') >= 0 || barType.indexOf('dbl_repeat') >= 0
}

function isStartRepeat(barType) {
  return barType.indexOf('left_repeat') >= 0 || barType.indexOf('dbl_repeat') >= 0
}

function cloneItem(item) {
  if (!item || typeof item !== 'object') return item
  if (Array.isArray(item)) {
    return item.map(function(entry) {
      if (!entry || typeof entry !== 'object') return entry
      return Object.assign({}, entry)
    })
  }
  // Shallow clone — abcjs elements can carry circular parent links.
  const out = Object.assign({}, item)
  if (Array.isArray(item.pitches)) {
    out.pitches = item.pitches.map(function(p) { return Object.assign({}, p) })
  }
  if (Array.isArray(item.gracenotes)) {
    out.gracenotes = item.gracenotes.map(function(p) { return Object.assign({}, p) })
  }
  if (Array.isArray(item.chord)) {
    out.chord = item.chord.map(function(c) { return Object.assign({}, c) })
  }
  if (Array.isArray(item.decoration)) {
    out.decoration = item.decoration.slice()
  }
  return out
}

function thinBarFrom(el) {
  if (!isBar(el)) return null
  if (el.el_type === 'bar') {
    return { el_type: 'bar', type: 'bar_thin' }
  }
  return {
    type: 'bar',
    barType: 'bar_thin',
    startEnding: '',
    endEnding: false,
  }
}

function stripRepeatBar(el) {
  const thin = thinBarFrom(el)
  return thin || cloneItem(el)
}

/**
 * Find the next repeat/volta block starting at or after `from`.
 * @returns {null|{kind:string, left:number, right:number, firstEnding:number, endings:object[], end:number, commonStart:number}}
 */
export function findNextRepeatBlock(list, from) {
  const items = Array.isArray(list) ? list : []
  let right = -1
  for (let j = from; j < items.length; j += 1) {
    if (isBar(items[j]) && isEndRepeat(barTypeOf(items[j]))) {
      right = j
      break
    }
  }
  if (right < 0) return null

  let left = from
  for (let j = right - 1; j >= from; j -= 1) {
    const bt = barTypeOf(items[j])
    if (isBar(items[j]) && isStartRepeat(bt) && !isEndRepeat(bt)) {
      left = j
      break
    }
  }

  let firstEnding = -1
  for (let j = left; j <= right; j += 1) {
    if (isBar(items[j]) && startEndingOf(items[j])) {
      firstEnding = j
      break
    }
  }

  if (firstEnding < 0) {
    return {
      kind: 'simple',
      left: left,
      right: right,
      firstEnding: -1,
      endings: [],
      commonStart: left + (isBar(items[left]) && isStartRepeat(barTypeOf(items[left])) && !isEndRepeat(barTypeOf(items[left])) ? 1 : 0),
      end: right + 1,
    }
  }

  const endings = []
  let pos = firstEnding
  let blockEnd = right + 1
  let guard = 0
  while (pos < items.length && guard < 1000) {
    guard += 1
    if (!isBar(items[pos]) || !startEndingOf(items[pos])) break
    const passes = parseVoltaPasses(startEndingOf(items[pos]))
    let endingEnd = pos + 1
    let closeIdx = -1
    for (let j = pos + 1; j < items.length; j += 1) {
      if (!isBar(items[j])) {
        endingEnd = j + 1
        continue
      }
      const se = startEndingOf(items[j])
      const bt = barTypeOf(items[j])
      if (se) {
        // `:|2,4` — closes prior ending and opens the next
        endingEnd = j
        closeIdx = j
        break
      }
      if (isEndRepeat(bt)) {
        endingEnd = j
        closeIdx = j
        blockEnd = j + 1
        break
      }
      if (items[j].endEnding || se === '') {
        // plain bar; keep scanning unless endEnding without repeat ends volta
        if (items[j].endEnding && !isEndRepeat(bt)) {
          endingEnd = j + 1
          closeIdx = j
          blockEnd = j + 1
          break
        }
      }
      endingEnd = j + 1
    }
    endings.push({
      passes: passes,
      barIdx: pos,
      contentStart: pos + 1,
      contentEnd: endingEnd,
      closeIdx: closeIdx,
    })
    if (closeIdx >= 0 && startEndingOf(items[closeIdx]) && closeIdx > pos) {
      pos = closeIdx
      continue
    }
    if (closeIdx >= 0) {
      blockEnd = closeIdx + 1
    }
    break
  }

  // Include a trailing left-repeat bar that sits at the same spot only if it
  // belongs to the *next* section — leave it for the following block.
  while (blockEnd < items.length
    && isBar(items[blockEnd])
    && isStartRepeat(barTypeOf(items[blockEnd]))
    && !isEndRepeat(barTypeOf(items[blockEnd]))
    && !startEndingOf(items[blockEnd])) {
    // next section's |: — stop before it
    break
  }

  const leftIsStartOnly = isBar(items[left])
    && isStartRepeat(barTypeOf(items[left]))
    && !isEndRepeat(barTypeOf(items[left]))

  return {
    kind: 'volta',
    left: left,
    right: right,
    firstEnding: firstEnding,
    endings: endings,
    commonStart: leftIsStartOnly ? left + 1 : left,
    end: blockEnd,
  }
}

function maxEndingPass(endings) {
  let max = 0
  ;(endings || []).forEach(function(ending) {
    ;(ending.passes || []).forEach(function(p) {
      if (p > max) max = p
    })
  })
  return max
}

function endingForPass(endings, pass) {
  for (let i = 0; i < endings.length; i += 1) {
    if ((endings[i].passes || []).indexOf(pass) >= 0) return endings[i]
  }
  return null
}

function pushSlice(out, list, start, end, asThinBars) {
  for (let i = start; i < end; i += 1) {
    const el = list[i]
    if (!el) continue
    if (asThinBars && isBar(el)) out.push(stripRepeatBar(el))
    else out.push(cloneItem(el))
  }
}

function itemDurationWhole(el) {
  if (!el) return 0
  if (el.type === 'note') return el.d > 0 ? el.d : 0
  if (el.el_type === 'note' || el.el_type === 'rest') return parseFloat(el.duration) || 0
  return 0
}

/**
 * Written whole-note start time for each index in a linear voice (bars have
 * zero duration; notes/rests advance time).
 */
export function writtenStartsForVoice(list) {
  const items = Array.isArray(list) ? list : []
  const starts = new Array(items.length)
  let t = 0
  for (let i = 0; i < items.length; i += 1) {
    starts[i] = t
    t += itemDurationWhole(items[i])
  }
  return { starts: starts, writtenWhole: t }
}

function sliceDurationWhole(list, start, end) {
  let d = 0
  for (let i = start; i < end; i += 1) d += itemDurationWhole(list[i])
  return d
}

function writtenSpanForSlice(writtenStarts, list, start, end) {
  if (!(end > start) || !writtenStarts || !writtenStarts.length) {
    return { writtenStartWhole: 0, writtenEndWhole: 0 }
  }
  const w0 = writtenStarts[start] != null ? writtenStarts[start] : 0
  let w1 = w0
  for (let i = start; i < end; i += 1) {
    w1 = (writtenStarts[i] != null ? writtenStarts[i] : w1) + itemDurationWhole(list[i])
  }
  return { writtenStartWhole: w0, writtenEndWhole: w1 }
}

function pushSegment(segments, soundingStart, soundingEnd, writtenStart, writtenEnd, passIndex) {
  if (!(soundingEnd > soundingStart + 1e-12)) return soundingStart
  if (!(writtenEnd > writtenStart + 1e-12) && Math.abs(writtenEnd - writtenStart) < 1e-12) {
    // Zero-written span (bars only) — still advance sounding if needed via caller
  }
  if (writtenEnd >= writtenStart) {
    segments.push({
      soundingStartWhole: soundingStart,
      soundingEndWhole: soundingEnd,
      writtenStartWhole: writtenStart,
      writtenEndWhole: writtenEnd,
      passIndex: passIndex || 1,
    })
  }
  return soundingEnd
}

/**
 * Index where a leading anacrusis ends when a repeat block starts at the
 * beginning of the tune with no |: after the pickup (common ABC omission).
 * Returns commonStart when there is no usable pickup split.
 */
export function bodyStartAfterLeadingPickup(list, commonStart, pickupWhole) {
  if (!(pickupWhole > 0) || commonStart !== 0) return commonStart
  const items = Array.isArray(list) ? list : []
  let dur = 0
  for (let i = 0; i < items.length; i += 1) {
    if (dur >= pickupWhole - 1e-9) return i
    dur += itemDurationWhole(items[i])
  }
  return commonStart
}

function expandBlock(list, block, options, segments, writtenStarts, soundingRef) {
  const opts = options || {}
  const pickupWhole = opts.pickupWhole > 0 ? opts.pickupWhole : 0
  const out = []
  const bodyStart = bodyStartAfterLeadingPickup(list, block.commonStart, pickupWhole)
  const hasLeadingPickup = bodyStart > block.commonStart
  const passBodyStart = hasLeadingPickup ? bodyStart : block.commonStart
  const collect = Array.isArray(segments)
  let sounding = soundingRef && typeof soundingRef.t === 'number' ? soundingRef.t : 0

  function emitSlice(from, to, passIndex) {
    pushSlice(out, list, from, to, true)
    if (!collect) return
    const dur = sliceDurationWhole(list, from, to)
    if (!(dur > 0)) return
    const span = writtenSpanForSlice(writtenStarts, list, from, to)
    sounding = pushSegment(
      segments,
      sounding,
      sounding + dur,
      span.writtenStartWhole,
      span.writtenEndWhole,
      passIndex
    )
  }

  function emitBarOnly(el, passIndex) {
    out.push(stripRepeatBar(el))
  }

  if (block.kind === 'simple') {
    if (hasLeadingPickup) {
      emitSlice(block.commonStart, bodyStart, 1)
    }
    if (block.left < block.commonStart) {
      emitBarOnly(list[block.left], 1)
    }
    emitSlice(passBodyStart, block.right, 1)
    emitBarOnly(list[block.right], 1)
    emitSlice(passBodyStart, block.right, 2)
    emitBarOnly(list[block.right], 2)
    if (soundingRef) soundingRef.t = sounding
    return out
  }

  const passCount = Math.max(2, maxEndingPass(block.endings))
  for (let pass = 1; pass <= passCount; pass += 1) {
    if (pass === 1 && hasLeadingPickup) {
      emitSlice(block.commonStart, bodyStart, pass)
    }
    if (pass === 1 && block.left < block.commonStart) {
      emitBarOnly(list[block.left], pass)
    }
    emitSlice(passBodyStart, block.firstEnding, pass)
    const ending = endingForPass(block.endings, pass)
    if (ending) {
      emitBarOnly(list[ending.barIdx], pass)
      emitSlice(ending.contentStart, ending.contentEnd, pass)
      if (ending.closeIdx >= 0 && ending.closeIdx >= ending.contentEnd) {
        emitBarOnly(list[ending.closeIdx], pass)
      } else if (ending.contentEnd < list.length && isBar(list[ending.contentEnd])) {
        const closeBar = list[ending.contentEnd]
        if (isEndRepeat(barTypeOf(closeBar)) || startEndingOf(closeBar) || closeBar.endEnding) {
          emitBarOnly(closeBar, pass)
        }
      }
    }
  }
  if (soundingRef) soundingRef.t = sounding
  return out
}

/**
 * Flatten voice elements or fill tokens through repeats / multi-number voltas.
 * @param {object[]} items
 * @param {{ pickupWhole?: number, segments?: object[], writtenStarts?: number[] }} [options]
 */
export function expandThroughVoltaRepeats(items, options) {
  const list = Array.isArray(items) ? items : []
  const opts = options || {}
  const segments = opts.segments
  const writtenMeta = opts.writtenStarts
    ? { starts: opts.writtenStarts }
    : writtenStartsForVoice(list)
  const writtenStarts = writtenMeta.starts
  const out = []
  const soundingRef = { t: 0 }
  let i = 0
  let guard = 0
  while (i < list.length && guard < 100000) {
    guard += 1
    const block = findNextRepeatBlock(list, i)
    if (!block) {
      for (; i < list.length; i += 1) {
        const el = list[i]
        out.push(cloneItem(el))
        if (Array.isArray(segments)) {
          const dur = itemDurationWhole(el)
          if (dur > 0) {
            const w0 = writtenStarts[i] != null ? writtenStarts[i] : soundingRef.t
            soundingRef.t = pushSegment(
              segments,
              soundingRef.t,
              soundingRef.t + dur,
              w0,
              w0 + dur,
              1
            )
          }
        }
      }
      break
    }
    for (; i < block.left; i += 1) {
      const el = list[i]
      out.push(cloneItem(el))
      if (Array.isArray(segments)) {
        const dur = itemDurationWhole(el)
        if (dur > 0) {
          const w0 = writtenStarts[i] != null ? writtenStarts[i] : soundingRef.t
          soundingRef.t = pushSegment(
            segments,
            soundingRef.t,
            soundingRef.t + dur,
            w0,
            w0 + dur,
            1
          )
        }
      }
    }
    out.push.apply(out, expandBlock(list, block, opts, segments, writtenStarts, soundingRef))
    i = block.end
  }
  return out
}

function delineatedFirstVoice(visualObj) {
  if (!visualObj || !Array.isArray(visualObj.lines)) return null
  let baseLines = visualObj.lines
  if (typeof visualObj.deline === 'function') {
    try {
      const delineated = visualObj.deline()
      if (Array.isArray(delineated) && delineated.length) baseLines = delineated
    } catch (err) {
      baseLines = visualObj.lines
    }
  }
  for (let li = 0; li < baseLines.length; li += 1) {
    const line = baseLines[li]
    const staffList = line && line.staff
    if (!Array.isArray(staffList) || !staffList.length) continue
    const voices = staffList[0].voices
    if (!Array.isArray(voices) || !voices.length) continue
    if (Array.isArray(voices[0])) return voices[0]
  }
  return null
}

/**
 * Build sounding→written segments for the first voice (same expansion as audio/fill).
 * @returns {{ segments: object[], soundingWhole: number, writtenWhole: number, pickupWhole: number }}
 */
export function buildSoundingWrittenMap(visualObj) {
  const empty = { segments: [], soundingWhole: 0, writtenWhole: 0, pickupWhole: 0 }
  const voice = delineatedFirstVoice(visualObj)
  if (!voice || !voice.length) return empty
  const pickupWhole = typeof visualObj.getPickupLength === 'function'
    ? (parseFloat(visualObj.getPickupLength()) || 0)
    : 0
  const writtenMeta = writtenStartsForVoice(voice)
  const segments = []
  expandThroughVoltaRepeats(voice, {
    pickupWhole: pickupWhole > 0 ? pickupWhole : undefined,
    segments: segments,
    writtenStarts: writtenMeta.starts,
  })
  const soundingWhole = segments.length
    ? segments[segments.length - 1].soundingEndWhole
    : 0
  return {
    segments: segments,
    soundingWhole: soundingWhole,
    writtenWhole: writtenMeta.writtenWhole,
    pickupWhole: pickupWhole,
  }
}

/**
 * Map a sounding whole-note position onto the written score.
 * @returns {{ writtenWhole: number, passIndex: number } | null}
 */
export function mapSoundingWholeToWritten(segments, soundingWhole) {
  const list = Array.isArray(segments) ? segments : []
  const t = parseFloat(soundingWhole)
  if (!(t >= 0) || !list.length) return null
  for (let i = 0; i < list.length; i += 1) {
    const seg = list[i]
    if (t < seg.soundingStartWhole - 1e-9) continue
    if (t > seg.soundingEndWhole + 1e-9) continue
    const span = Math.max(1e-9, seg.soundingEndWhole - seg.soundingStartWhole)
    const frac = Math.max(0, Math.min(1, (t - seg.soundingStartWhole) / span))
    const writtenSpan = Math.max(0, seg.writtenEndWhole - seg.writtenStartWhole)
    return {
      writtenWhole: seg.writtenStartWhole + frac * writtenSpan,
      passIndex: seg.passIndex || 1,
    }
  }
  const last = list[list.length - 1]
  if (t >= last.soundingEndWhole - 1e-9) {
    return {
      writtenWhole: last.writtenEndWhole,
      passIndex: last.passIndex || 1,
    }
  }
  return null
}

/**
 * Convert whole-note sounding segments to beat-unit segments for playalong.
 */
export function soundingSegmentsToBeats(segments, beatLengthWhole) {
  const beatLen = beatLengthWhole > 0 ? beatLengthWhole : 0.25
  return (Array.isArray(segments) ? segments : []).map(function(seg) {
    return {
      soundingStart: seg.soundingStartWhole / beatLen,
      soundingEnd: seg.soundingEndWhole / beatLen,
      writtenStart: seg.writtenStartWhole / beatLen,
      writtenEnd: seg.writtenEndWhole / beatLen,
      passIndex: seg.passIndex || 1,
    }
  })
}

/**
 * Concatenate staff voices across printed lines so voltas that abcjs split
 * onto separate lines (`|1,3` / `:|2,4`) form one repeat block.
 */
function forceMergeStaffLines(lines) {
  if (!Array.isArray(lines) || lines.length <= 1) return lines
  const first = lines[0]
  if (!first || !Array.isArray(first.staff) || !first.staff.length) return lines
  const staff = first.staff.map(function(st, si) {
    if (!st || !Array.isArray(st.voices)) return st
    const voices = st.voices.map(function(_voice, vi) {
      const merged = []
      for (let li = 0; li < lines.length; li += 1) {
        const line = lines[li]
        const other = line && line.staff && line.staff[si]
          && line.staff[si].voices && line.staff[si].voices[vi]
        if (Array.isArray(other)) merged.push.apply(merged, other)
      }
      return merged
    })
    return Object.assign({}, st, { voices: voices })
  })
  return [Object.assign({}, first, { staff: staff })]
}

/**
 * Clone a visualObj with each voice expanded through volta/repeats so
 * setUpAudio sees a linear score (abcjs then does not mis-expand).
 *
 * Staff-line breaks often split `|1,3` from `:|2,4`. Expanding per printed
 * line leaves ending 2 as its own `|:`…`:|` island (abcjs then repeats only
 * that ending). Always merge lines first, expand the single stream, then
 * rebuild as one line so setUpAudio cannot re-split voltas.
 */
export function expandVisualObjThroughVoltaRepeats(visualObj) {
  if (!visualObj || !Array.isArray(visualObj.lines)) return visualObj

  const pickupWhole = typeof visualObj.getPickupLength === 'function'
    ? (parseFloat(visualObj.getPickupLength()) || 0)
    : 0
  const expandOpts = pickupWhole > 0 ? { pickupWhole: pickupWhole } : {}

  let baseLines = visualObj.lines
  if (typeof visualObj.deline === 'function') {
    try {
      const delineated = visualObj.deline()
      if (Array.isArray(delineated) && delineated.length) baseLines = delineated
    } catch (err) {
      baseLines = visualObj.lines
    }
  }
  baseLines = forceMergeStaffLines(baseLines)

  const lines = baseLines.map(function(line) {
    if (!line || !Array.isArray(line.staff)) return line
    return Object.assign({}, line, {
      staff: line.staff.map(function(staff) {
        if (!staff || !Array.isArray(staff.voices)) return staff
        return Object.assign({}, staff, {
          voices: staff.voices.map(function(voice) {
            return expandThroughVoltaRepeats(voice, expandOpts)
          }),
        })
      }),
    })
  })

  const expanded = Object.create(Object.getPrototypeOf(visualObj))
  Object.keys(visualObj).forEach(function(key) {
    if (key === 'lines') return
    expanded[key] = visualObj[key]
  })
  expanded.lines = lines
  // Prevent callers from re-delineating back into pre-expand staff breaks.
  expanded.deline = function() { return lines }
  return expanded
}
