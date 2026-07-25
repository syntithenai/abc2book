import { useMemo } from 'react'
import LessonMarkdown from './LessonMarkdown'
import LessonTrackRef from './LessonTrackRef'
import LessonQuizPlayer from './LessonQuizPlayer'
import {
  lessonTextHasTrackMarkers,
  splitLessonTrackMarkers,
  renderLessonInlineParts,
} from '../lessonTrackMarkers'
import { normalizeHighlightTerm } from '../lessonSearchHighlight'
import { renderHighlightedPlainText } from '../lessonSearchHighlightRender'

function isBlockMarkdown(text) {
  if (!text) return false
  if (/^\s*\|/.test(text) || /^\s*!\[/.test(text)) return true
  if (/^\s*```/.test(text)) return true
  if (text.indexOf('\n|') !== -1 || text.indexOf('\n![') !== -1) return true
  if (text.indexOf('\n```') !== -1) return true
  if (text.indexOf('\n\n') !== -1) return true
  return false
}

function isInlineCapableBlock(block) {
  if (!block) return false
  if (block.type === 'track' || block.type === 'entity') return true
  if (block.type === 'markdown') {
    const text = block.text || ''
    if (isBlockMarkdown(text)) return false
    return true
  }
  return false
}

function coalesceInlineBlocks(blocks) {
  const out = []
  let group = []
  let groupStartIndex = -1
  function flush() {
    if (!group.length) return
    if (group.length === 1) {
      out.push(Object.assign({}, group[0], { _sourceIndex: groupStartIndex }))
    } else {
      out.push({
        type: 'inlineGroup',
        blocks: group,
        _sourceIndex: groupStartIndex,
        _sourceEndIndex: groupStartIndex + group.length - 1,
      })
    }
    group = []
    groupStartIndex = -1
  }
  ;(blocks || []).forEach(function(block, index) {
    if (isInlineCapableBlock(block)) {
      if (!group.length) groupStartIndex = index
      group.push(block)
    } else {
      flush()
      out.push(Object.assign({}, block, { _sourceIndex: index }))
    }
  })
  flush()
  return out
}

function wrapBlockWithPosition(block, content, key) {
  const index = block && block._sourceIndex
  if (index == null || index < 0) return content
  const attrs = {
    className: 'lesson-block-position',
    'data-lesson-block-index': index,
    'data-lesson-block-type': block.type || 'unknown',
  }
  if (block._sourceEndIndex != null && block._sourceEndIndex !== index) {
    attrs['data-lesson-block-end-index'] = block._sourceEndIndex
  }
  return (
    <div key={key + '-pos'} className="lesson-block-position" style={{ display: 'contents' }} {...attrs}>
      {content}
    </div>
  )
}

function renderMarkdownText(text, ctx, key, className) {
  const source = text || ''
  const highlightTerm = ctx.highlightTerm
  const highlightState = ctx.highlightState
  if (lessonTextHasTrackMarkers(source)) {
    const parts = splitLessonTrackMarkers(source)
    return (
      <span key={key} className={'lesson-inline-flow' + (className ? ' ' + className : '')}>
        {renderLessonInlineParts(parts, ctx, function(fragment, fragKey) {
          return (
            <LessonMarkdown
              key={fragKey}
              className="lesson-markdown-inline"
              text={fragment}
              inline
              highlightTerm={highlightTerm}
              highlightState={highlightState}
            />
          )
        }, key)}
      </span>
    )
  }
  return (
    <LessonMarkdown
      key={key}
      className={className || 'lesson-markdown-inline'}
      text={source}
      inline={!isBlockMarkdown(source)}
      highlightTerm={highlightTerm}
      highlightState={highlightState}
    />
  )
}

function renderInlineGroup(blocks, ctx, key) {
  return (
    <span key={key} className="lesson-inline-flow">
      {(blocks || []).map(function(block, index) {
        return renderBlock(block, ctx, key + '-g-' + index)
      })}
    </span>
  )
}

function renderBlock(block, ctx, key) {
  if (!block) return null
  let content = null
  if (block.type === 'inlineGroup') {
    content = renderInlineGroup(block.blocks, ctx, key)
  } else if (block.type === 'entity') {
    const entity = (ctx.entitiesById || {})[block.id]
    const name = entity && entity.name ? entity.name : block.id
    content = (
      <strong key={key}>
        {renderHighlightedPlainText(name, ctx.highlightTerm, key + '-ent', ctx.highlightState)}
      </strong>
    )
  } else if (block.type === 'track') {
    const track = (ctx.tracksById || {})[block.id]
    const entityId = track && (track.entity_id || track.entityId)
    const entity = entityId ? (ctx.entitiesById || {})[entityId] : null
    content = (
      <LessonTrackRef
        key={key}
        trackId={block.id}
        track={track}
        entity={entity}
        label={block.label || (track && track.label) || block.id}
        lesson={ctx.lesson}
        tunebook={ctx.tunebook}
        navigate={ctx.navigate}
        mediaController={ctx.mediaController}
      />
    )
  } else {
    content = renderMarkdownText(block.text || '', ctx, key, 'lesson-markdown-inline')
  }
  return wrapBlockWithPosition(block, content, key)
}

function renderBlocks(blocks, ctx) {
  if (!Array.isArray(blocks)) return null
  return coalesceInlineBlocks(blocks).map(function(block, i) {
    return renderBlock(block, ctx, 'block-' + i)
  })
}

function ReadingListSection(props) {
  const items = props.items || []
  if (!items.length) return null
  const books = items.filter(function(i) { return i && i.type === 'book' })
  const links = items.filter(function(i) { return i && (i.type === 'link' || i.url) })
  return (
    <section className="lesson-reading-list" id="reading-list">
      <h2>Reading list</h2>
      {books.length ? (
        <div className="lesson-reading-books">
          <h3>Books</h3>
          <ul>
            {books.map(function(book, i) {
              return (
                <li key={'book-' + i}>
                  {book.author ? <strong>{book.author}</strong> : null}
                  {book.author ? ', ' : null}
                  <em>{book.title}</em>
                  {book.note ? ' — ' + book.note : null}
                  {book.url ? (
                    <>
                      {' '}
                      <a href={book.url} target="_blank" rel="noreferrer">Link</a>
                    </>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {links.length ? (
        <div className="lesson-reading-links">
          <h3>Links</h3>
          <ul>
            {links.map(function(link, i) {
              return (
                <li key={'link-' + i}>
                  <a href={link.url} target="_blank" rel="noreferrer">{link.title || link.url}</a>
                  {link.note ? ' — ' + link.note : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function TuneSections(props) {
  const tunes = props.tunes || []
  if (!tunes.length) return null
  const ctx = props.ctx
  return (
    <section className="lesson-tunes-section">
      <h2>Tune deep dives</h2>
      {tunes.map(function(tune) {
        return (
          <article key={tune.id} className="lesson-tune-card" id={'tune-' + tune.id}>
            <h3>{tune.name}</h3>
            {tune.form ? <p className="text-muted">{tune.form}</p> : null}
            {tune.about ? <p>{tune.about}</p> : null}
            {tune.reference ? <p className="small text-muted">{tune.reference}</p> : null}
            {(tune.playlist || []).map(function(track, i) {
              const ent = (ctx.entitiesById || {})[track.entity_id || track.entityId]
              const lessonWithPlaylist = Object.assign({}, ctx.lesson, { playlist: tune.playlist })
              return (
                <div key={tune.id + '-tr-' + i} className="lesson-tune-recording">
                  <LessonTrackRef
                    trackId={track.id}
                    track={track}
                    entity={ent}
                    label={track.label || tune.name}
                    lesson={lessonWithPlaylist}
                    tunebook={ctx.tunebook}
                    navigate={ctx.navigate}
                    mediaController={ctx.mediaController}
                  />
                </div>
              )
            })}
          </article>
        )
      })}
    </section>
  )
}

export default function LessonContent(props) {
  const lesson = props.lesson
  const highlightTerm = normalizeHighlightTerm(props.highlightQuery)
  const highlightState = useMemo(function() {
    return { firstAssigned: false }
  }, [lesson && lesson.id, highlightTerm, props.highlightQuery])

  if (!lesson) return null

  const entitiesById = {}
  ;(lesson.entities || []).forEach(function(e) {
    if (e && e.id) entitiesById[e.id] = e
  })
  const tracksById = {}
  ;(lesson.playlist || []).forEach(function(t) {
    if (t && t.id) tracksById[t.id] = t
  })
  ;(lesson.tunes || []).forEach(function(tune) {
    ;(tune.playlist || []).forEach(function(t) {
      if (t && t.id && !tracksById[t.id]) tracksById[t.id] = t
    })
  })
  const ctx = {
    lesson: lesson,
    entitiesById: entitiesById,
    tracksById: tracksById,
    tunebook: props.tunebook,
    navigate: props.navigate,
    mediaController: props.mediaController,
    highlightTerm: highlightTerm,
    highlightState: highlightState,
  }

  return (
    <article className="lesson-content">
      {(lesson.sections || []).map(function(section) {
        if (!section) return null
        if (/^quiz questions$/i.test(section.title || '')) return null
        if (/^Q\d+\./i.test(section.title || '')) return null
        if (section.level === 1) return null
        return (
          <section key={section.id} id={section.id} className="lesson-section">
            {section.level <= 2 ? (
              <h2>
                {renderHighlightedPlainText(section.title || '', highlightTerm, section.id + '-title', highlightState)}
              </h2>
            ) : (
              <h3>
                {renderHighlightedPlainText(section.title || '', highlightTerm, section.id + '-title', highlightState)}
              </h3>
            )}
            <div className="lesson-section-body">
              {renderBlocks(section.blocks, ctx)}
            </div>
          </section>
        )
      })}

      {lesson.quiz || lesson.quiz_questions || lesson.quiz_markdown ? (
        <section className="lesson-quiz" id="quiz">
          <LessonQuizPlayer lesson={lesson} onQuizFeedback={props.onQuizFeedback} />
        </section>
      ) : null}

      {lesson.key_points && lesson.key_points.length ? (
        <section className="lesson-key-points" id="key-points">
          <h2>Key points</h2>
          <ul>
            {lesson.key_points.map(function(point, i) {
              return (
                <li
                  key={'kp-' + i}
                  data-lesson-block-index={i}
                  data-lesson-block-type="key_point"
                >
                  {renderHighlightedPlainText(point, highlightTerm, 'kp-' + i, highlightState)}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <ReadingListSection items={lesson.reading_list} />
      <TuneSections tunes={lesson.tunes} ctx={ctx} />
    </article>
  )
}
