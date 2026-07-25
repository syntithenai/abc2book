// Markdown parser for lesson content: headings, paragraphs, lists, images, tables, hr.

import { parseInline } from './markdownUtils'

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const UL_RE = /^\s*[-*+]\s+(.*)$/
const OL_RE = /^\s*\d+[.)]\s+(.*)$/
const LIST_PREFIX_RE = /^\s*(?:[-*+]|\d+[.)])\s+/
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/
const TABLE_SEP_RE = /^\|?[\s:-]+\|[\s|:-]+$/
const FENCE_OPEN_RE = /^```(\w*)\s*$/

function isTableRow(line) {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.indexOf('|', 1) !== -1
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(cell) {
    return parseInline(cell.trim())
  })
}

/** Inline-only parse: strips list markers so play links stay in the same line as prose. */
export function parseLessonMarkdownInline(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const inlineLines = []
  lines.forEach(function(rawLine) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) return
    inlineLines.push(parseInline(line.replace(LIST_PREFIX_RE, '')))
  })
  if (!inlineLines.length) {
    return [{ type: 'paragraph', lines: [parseInline('')] }]
  }
  return [{ type: 'paragraph', lines: inlineLines }]
}

export function parseLessonMarkdownBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  let list = null

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraph.map(parseInline) })
      paragraph = []
    }
  }

  function flushList() {
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  let i = 0
  while (i < lines.length) {
    const rawLine = lines[i]
    const line = rawLine.replace(/\s+$/, '')

    if (line.trim() === '') {
      flushParagraph()
      flushList()
      i += 1
      continue
    }

    const fenceOpen = FENCE_OPEN_RE.exec(line.trim())
    if (fenceOpen) {
      flushParagraph()
      flushList()
      const lang = (fenceOpen[1] || '').trim().toLowerCase()
      i += 1
      const fenceLines = []
      while (i < lines.length && !FENCE_OPEN_RE.test(lines[i].trim())) {
        fenceLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      const code = fenceLines.join('\n')
      if (lang === 'mermaid') {
        blocks.push({ type: 'mermaid', code: code })
      } else {
        blocks.push({ type: 'code', lang: lang, code: code })
      }
      continue
    }

    if (HR_RE.test(line.trim())) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const imageMatch = IMAGE_RE.exec(line.trim())
    if (imageMatch) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'image', alt: imageMatch[1], src: imageMatch[2] })
      i += 1
      continue
    }

    const headingMatch = HEADING_RE.exec(line)
    if (headingMatch) {
      flushParagraph()
      flushList()
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        children: parseInline(headingMatch[2]),
      })
      i += 1
      continue
    }

    if (isTableRow(line)) {
      flushParagraph()
      flushList()
      const tableLines = []
      while (i < lines.length && isTableRow(lines[i].replace(/\s+$/, ''))) {
        tableLines.push(lines[i].replace(/\s+$/, ''))
        i += 1
      }
      if (tableLines.length >= 2 && TABLE_SEP_RE.test(tableLines[1].trim())) {
        const header = parseTableRow(tableLines[0])
        const rows = tableLines.slice(2).map(parseTableRow)
        blocks.push({ type: 'table', header: header, rows: rows })
      } else {
        tableLines.forEach(function(row) { paragraph.push(row) })
      }
      continue
    }

    const olMatch = OL_RE.exec(line)
    if (olMatch) {
      flushParagraph()
      if (!list || list.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(parseInline(olMatch[1]))
      i += 1
      continue
    }

    const ulMatch = UL_RE.exec(line)
    if (ulMatch) {
      flushParagraph()
      if (!list || list.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(parseInline(ulMatch[1]))
      i += 1
      continue
    }

    flushList()
    paragraph.push(line)
    i += 1
  }

  flushParagraph()
  flushList()
  return blocks
}
