/**
 * Staff chord overlay (ported from eurosession review_abc.html v6).
 */
import abcjs from 'abcjs'

export function normalizeChordSymbolName(name) {
  return String(name || '')
    .trim()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/"/g, '')
}

function isSkippedRenderLine(t) {
  return /^%%MIDI transpose\s+-?\d+\s*$/i.test(t)
    || /^%\s*abcbook-transpose\s+-?\d+\s*$/i.test(t)
}

export function prepareAbcForRender(abc) {
  const source = String(abc || '')
  let render = ''
  const toSource = []

  function emitSrc(srcIdx, ch) {
    render += ch
    toSource.push(srcIdx)
  }

  function emitMusicLine(line, lineStart) {
    let i = 0
    while (i < line.length) {
      const srcIdx = lineStart + i
      const ch = line[i]
      if (ch === '|') {
        emitSrc(srcIdx, '|')
        i += 1
        continue
      }
      emitSrc(srcIdx, ch)
      i += 1
    }
  }

  let pos = 0
  while (pos <= source.length) {
    const nextNl = source.indexOf('\n', pos)
    const lineEnd = nextNl < 0 ? source.length : nextNl
    const line = source.slice(pos, lineEnd)
    const t = line.trim()
    if (!isSkippedRenderLine(t)) {
      if (!t || t.charAt(0) === '%' || /^[A-Za-z]:/.test(t)) {
        for (let k = 0; k < line.length; k += 1) emitSrc(pos + k, line[k])
      } else {
        emitMusicLine(line, pos)
      }
      if (nextNl >= 0) emitSrc(nextNl, '\n')
    }
    if (nextNl < 0) break
    pos = nextNl + 1
  }

  return {
    text: render.trim(),
    mapRange: function(startChar, endChar) {
      if (!toSource.length) return { start: 0, end: 0 }
      let a = typeof startChar === 'number' ? startChar : 0
      let b = typeof endChar === 'number' ? endChar : a
      if (a > b) { const tmp = a; a = b; b = tmp }
      a = Math.max(0, Math.min(a, toSource.length - 1))
      b = Math.max(a + 1, Math.min(b, toSource.length))
      const srcStart = toSource[a]
      const srcEnd = toSource[b - 1] + 1
      return { start: srcStart, end: Math.max(srcStart + 1, srcEnd) }
    },
  }
}

export function enumerateAbcNotes(abc) {
  const text = String(abc || '')
  const notes = []
  let offset = 0
  const lines = text.split('\n')
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]
    const lineStart = offset
    const trimmed = line.trim()
    const isHeader = !trimmed || trimmed.charAt(0) === '%' || /^[A-Za-z]:/.test(trimmed)
    if (!isHeader) {
      let i = 0
      let pendingChord = null
      while (i < line.length) {
        const abs = lineStart + i
        const ch = line[i]
        if (/\s/.test(ch)) { i += 1; continue }
        if (ch === '"') {
          let j = i + 1
          while (j < line.length && line[j] !== '"') j += 1
          const end = Math.min(j + 1, line.length)
          pendingChord = {
            name: normalizeChordSymbolName(line.slice(i + 1, Math.min(j, line.length))),
            start: abs,
            end: lineStart + end,
          }
          i = end
          continue
        }
        if (ch === '{' || ch === '!') {
          let j = i + 1
          while (j < line.length && line[j] !== (ch === '{' ? '}' : '!')) j += 1
          i = Math.min(j + 1, line.length)
          pendingChord = null
          continue
        }
        if (/[_^=]/.test(ch) || /[A-Ga-gzxZ]/.test(ch)) {
          let j = i
          while (j < line.length && /[_^=]/.test(line[j])) j += 1
          if (/[zxZ]/.test(line[j])) j += 1
          else if (/[A-Ga-g]/.test(line[j])) {
            j += 1
            while (line[j] === ',' || line[j] === "'") j += 1
          } else { i += 1; continue }
          const rest = line.slice(j)
          const dm = rest.match(/^(\d+)\/(\d+)/) || rest.match(/^\/(\d+)/) || rest.match(/^(\d+)/)
          if (dm) j += dm[0].length
          notes.push({ index: notes.length, noteStart: abs, noteEnd: lineStart + j, chord: pendingChord })
          pendingChord = null
          i = j
          continue
        }
        if (ch === '|' || ch === ':') pendingChord = null
        i += 1
      }
    }
    offset += line.length + 1
  }
  return notes
}

export function setChordOnNoteIndex(sourceAbc, noteIndex, chordName) {
  const text = String(sourceAbc || '')
  const notes = enumerateAbcNotes(text)
  const note = notes[noteIndex]
  if (!note) return text
  const next = normalizeChordSymbolName(chordName)
  let base = text
  let insertAt = note.noteStart
  if (note.chord) {
    base = text.slice(0, note.chord.start) + text.slice(note.chord.end)
    const notes2 = enumerateAbcNotes(base)
    const note2 = notes2[noteIndex]
    if (!note2) return text
    if (!next) return base
    insertAt = note2.noteStart
  } else if (!next) {
    return text
  }
  return base.slice(0, insertAt) + '"' + next + '"' + base.slice(insertAt)
}

function noteHeadRect(svgEl) {
  if (!svgEl || !svgEl.getBoundingClientRect) return null
  const head = svgEl.querySelector
    ? (svgEl.querySelector('.abcjs-notehead')
      || svgEl.querySelector('.abcjs-rest')
      || svgEl.querySelector('.abcjs-grace-notehead'))
    : null
  const el = head || svgEl
  const r = el.getBoundingClientRect()
  if (!(r.width || r.height)) return null
  return r
}

function noteSelectableList(visual) {
  const engraver = visual && visual[0] && visual[0].engraver
  const sels = (engraver && engraver.selectables) || []
  const out = []
  for (let i = 0; i < sels.length; i += 1) {
    const sel = sels[i]
    const abcelem = sel && sel.absEl && sel.absEl.abcelem
    if (!abcelem || abcelem.el_type !== 'note') continue
    if (!sel.svgEl) continue
    out.push(sel)
  }
  return out
}

function chordNameFromAbcelem(sel) {
  const abcelem = sel && sel.absEl && sel.absEl.abcelem
  if (!abcelem || !abcelem.chord || !abcelem.chord.length) return ''
  return normalizeChordSymbolName(abcelem.chord[0].name || '')
}

function sourceNoteForSelectable(sel, prepared, sourceNotes) {
  const abcelem = sel && sel.absEl && sel.absEl.abcelem
  if (!abcelem || abcelem.startChar == null || !sourceNotes.length) return null
  let srcStart = abcelem.startChar
  let srcEnd = abcelem.endChar != null ? abcelem.endChar : srcStart + 1
  if (prepared && typeof prepared.mapRange === 'function') {
    const mapped = prepared.mapRange(srcStart, srcEnd)
    srcStart = mapped.start
    srcEnd = mapped.end
  }
  for (let i = 0; i < sourceNotes.length; i += 1) {
    const n = sourceNotes[i]
    if (srcStart >= n.noteStart && srcStart < n.noteEnd) return n
  }
  return null
}

function staffTopYByLine(engraveRoot, engraveRect) {
  const map = {}
  if (!engraveRoot || !engraveRect) return map
  const nodes = engraveRoot.querySelectorAll('.abcjs-staff')
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i]
    const cls = String(el.getAttribute('class') || '')
    const m = cls.match(/(?:^|\s)abcjs-l(\d+)(?:\s|$)/)
    if (!m) continue
    map['l' + m[1]] = el.getBoundingClientRect().top - engraveRect.top
  }
  return map
}

function chordRowYByNote(noteInfos, staffTopByLine) {
  const GAP = 32
  const fallbackMin = {}
  for (let i = 0; i < noteInfos.length; i += 1) {
    const key = noteInfos[i].systemKey || ('i' + i)
    if (fallbackMin[key] == null || noteInfos[i].noteTop < fallbackMin[key]) {
      fallbackMin[key] = noteInfos[i].noteTop
    }
  }
  const rowY = new Array(noteInfos.length)
  for (let i = 0; i < noteInfos.length; i += 1) {
    const key = noteInfos[i].systemKey || ('i' + i)
    const staffTop = staffTopByLine && staffTopByLine[key]
    rowY[i] = typeof staffTop === 'number' ? staffTop - GAP : fallbackMin[key] - GAP
  }
  return rowY
}

export function mountChordOverlay(options) {
  const { container, visual, sourceAbc, onOpenDialog } = options || {}
  if (!container || !visual || !sourceAbc) return function() {}

  const prepared = prepareAbcForRender(sourceAbc)
  const sels = noteSelectableList(visual)
  const sourceNotes = enumerateAbcNotes(sourceAbc)
  if (!sels.length || !sourceNotes.length) return function() {}

  container.querySelectorAll('.staff-chord-layer').forEach(function(el) { el.remove() })
  const layer = document.createElement('div')
  layer.className = 'staff-chord-layer bir-staff-chord-layer'
  container.appendChild(layer)

  const engraveRect = container.getBoundingClientRect()
  const noteInfos = []
  for (let index = 0; index < sels.length; index += 1) {
    const sel = sels[index]
    if (!sel.svgEl) continue
    const headR = noteHeadRect(sel.svgEl)
    if (!headR) continue
    const src = sourceNoteForSelectable(sel, prepared, sourceNotes)
    const chordName = (src && src.chord && src.chord.name)
      ? normalizeChordSymbolName(src.chord.name)
      : chordNameFromAbcelem(sel)
    if (!src && !chordName) continue
    const fullR = sel.svgEl.getBoundingClientRect()
    const x = (fullR.left + fullR.width / 2) - engraveRect.left
    const noteTop = headR.top - engraveRect.top
    noteInfos.push({
      noteIndex: src ? src.index : -1,
      x: x,
      noteTop: noteTop,
      systemKey: 'l0',
      chordName: chordName,
    })
  }
  if (!noteInfos.length) {
    layer.remove()
    return function() {}
  }
  const staffTopByLine = staffTopYByLine(container, engraveRect)
  const rowYs = chordRowYByNote(noteInfos, staffTopByLine)

  noteInfos.forEach(function(info, idx) {
    const chordY = rowYs[idx]
    if (info.chordName) {
      const label = document.createElement('div')
      label.className = 'review-chord bir-review-chord'
      label.textContent = info.chordName
      label.style.left = info.x + 'px'
      label.style.top = chordY + 'px'
      label.addEventListener('click', function(ev) {
        ev.preventDefault()
        ev.stopPropagation()
        if (onOpenDialog) onOpenDialog({ noteIndex: info.noteIndex, chordName: info.chordName })
      })
      layer.appendChild(label)
    }
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'review-chord-add bir-review-chord-add'
    addBtn.textContent = '+'
    addBtn.style.left = (info.x + 8) + 'px'
    addBtn.style.top = (chordY - 4) + 'px'
    addBtn.addEventListener('click', function(ev) {
      ev.preventDefault()
      ev.stopPropagation()
      if (onOpenDialog) onOpenDialog({ noteIndex: info.noteIndex, chordName: '' })
    })
    layer.appendChild(addBtn)
  })

  container.classList.add('chord-edit-active')
  return function cleanup() {
    container.classList.remove('chord-edit-active')
    layer.remove()
  }
}

export function renderAbcForChordOverlay(container, abc) {
  const prepared = prepareAbcForRender(abc)
  const visual = abcjs.renderAbc(container, prepared.text, { responsive: 'resize' })
  return { visual: visual, prepared: prepared }
}

export function applyChordToNoteIndex(sourceAbc, noteIndex, chordName) {
  return setChordOnNoteIndex(sourceAbc, noteIndex, chordName)
}
