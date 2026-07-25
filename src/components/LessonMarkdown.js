import { parseLessonMarkdownBlocks, parseLessonMarkdownInline } from '../lessonMarkdownUtils'
import { lessonImageSrc } from '../lessonImageUtils'
import { renderHighlightedPlainText } from '../lessonSearchHighlightRender'
import LessonMermaid from './LessonMermaid'

function renderInline(nodes, keyPrefix, highlightTerm, highlightState) {
  return (nodes || []).map(function(node, index) {
    const key = keyPrefix + '-' + index
    if (!node) return null
    if (node.type === 'text') {
      return (
        <span key={key}>
          {renderHighlightedPlainText(node.value, highlightTerm, key, highlightState)}
        </span>
      )
    }
    if (node.type === 'strong') {
      return <strong key={key}>{renderInline(node.children, key, highlightTerm, highlightState)}</strong>
    }
    if (node.type === 'em') return <em key={key}>{renderInline(node.children, key, highlightTerm, highlightState)}</em>
    if (node.type === 'link') {
      return (
        <a key={key} href={node.href} target="_blank" rel="noreferrer">
          {renderInline(node.children, key, highlightTerm, highlightState)}
        </a>
      )
    }
    return null
  })
}

function renderParagraphLines(lines, keyPrefix, highlightTerm, highlightState) {
  const rendered = []
  ;(lines || []).forEach(function(inlineNodes, lineIndex) {
    if (lineIndex > 0) rendered.push(<br key={keyPrefix + '-br-' + lineIndex} />)
    rendered.push(
      <span key={keyPrefix + '-line-' + lineIndex}>
        {renderInline(inlineNodes, keyPrefix + '-line-' + lineIndex, highlightTerm, highlightState)}
      </span>
    )
  })
  return rendered
}

export default function LessonMarkdown(props) {
  const source = typeof props.text === 'string' ? props.text : ''
  const highlightTerm = props.highlightTerm || ''
  const highlightState = props.highlightState
  const parsedBlocks = Array.isArray(props.blocks)
    ? props.blocks
    : props.inline
      ? parseLessonMarkdownInline(source)
      : parseLessonMarkdownBlocks(source)

  if (props.inline && parsedBlocks.length === 1 && parsedBlocks[0].type === 'paragraph') {
    return (
      <span className={'lesson-markdown-inline-span' + (props.className ? ' ' + props.className : '')}>
        {renderParagraphLines(parsedBlocks[0].lines, 'inl', highlightTerm, highlightState)}
      </span>
    )
  }

  return (
    <div className={'lesson-markdown' + (props.className ? ' ' + props.className : '')}>
      {parsedBlocks.map(function(block, index) {
        const key = 'block-' + index
        if (!block) return null
        if (block.type === 'heading') {
          const Tag = 'h' + Math.min(6, Math.max(1, block.level))
          return <Tag key={key}>{renderInline(block.children, key, highlightTerm, highlightState)}</Tag>
        }
        if (block.type === 'image') {
          const imgSrc = lessonImageSrc(block.src)
          return (
            <figure key={key} className="lesson-markdown-figure">
              <img
                className="lesson-markdown-image"
                src={imgSrc}
                alt={block.alt || ''}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
              {block.alt ? (
                <figcaption className="lesson-markdown-caption">
                  {renderHighlightedPlainText(block.alt, highlightTerm, key + '-cap', highlightState)}
                </figcaption>
              ) : null}
            </figure>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={key} className="lesson-table-wrap">
              <table className="lesson-table">
                <thead>
                  <tr>
                    {(block.header || []).map(function(cell, ci) {
                      return (
                        <th key={key + '-h-' + ci}>
                          {renderInline(cell, key + '-h-' + ci, highlightTerm, highlightState)}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(block.rows || []).map(function(row, ri) {
                    return (
                      <tr key={key + '-r-' + ri}>
                        {row.map(function(cell, ci) {
                          return (
                            <td key={key + '-r-' + ri + '-c-' + ci}>
                              {renderInline(cell, key + '-r-' + ri + '-c-' + ci, highlightTerm, highlightState)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'hr') return <hr key={key} className="lesson-markdown-hr" />
        if (block.type === 'mermaid') {
          return <LessonMermaid key={key} chart={block.code} />
        }
        if (block.type === 'code') {
          return (
            <pre key={key} className="lesson-code-block">
              <code>{block.code}</code>
            </pre>
          )
        }
        if (block.type === 'ul') {
          return (
            <ul key={key}>
              {block.items.map(function(item, itemIndex) {
                return (
                  <li key={key + '-' + itemIndex}>
                    {renderInline(item, key + '-' + itemIndex, highlightTerm, highlightState)}
                  </li>
                )
              })}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={key}>
              {block.items.map(function(item, itemIndex) {
                return (
                  <li key={key + '-' + itemIndex}>
                    {renderInline(item, key + '-' + itemIndex, highlightTerm, highlightState)}
                  </li>
                )
              })}
            </ol>
          )
        }
        return <p key={key}>{renderParagraphLines(block.lines, key, highlightTerm, highlightState)}</p>
      })}
    </div>
  )
}
