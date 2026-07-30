import { useCallback, useEffect, useRef, useState } from 'react'
import LessonFeedbackModal from './LessonFeedbackModal'
import LessonFeedbackToolbar from './LessonFeedbackToolbar'
import { getAllLessonFeedback } from '../lessonFeedbackStore'
import {
  findLessonSelectionPosition,
  isLessonFeedbackAdmin,
  lessonContentFeedbackId,
  lessonQuizFeedbackId,
} from '../lessonFeedbackUtils'
import './LessonFeedback.css'

export default function LessonFeedbackHost(props) {
  const lesson = props.lesson
  const enabled = props.forceEnabled || isLessonFeedbackAdmin(props.user)
  const rootRef = useRef(null)
  const [feedbackDraft, setFeedbackDraft] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [feedbackRevision, setFeedbackRevision] = useState(0)
  const [selectionDraft, setSelectionDraft] = useState(null)
  const [feedbackCount, setFeedbackCount] = useState(function() {
    return enabled ? getAllLessonFeedback().length : 0
  })

  const clearSelectionDraft = useCallback(function() {
    setSelectionDraft(null)
  }, [])

  const openFeedback = useCallback(function(draft) {
    if (!enabled || !draft || !draft.itemId) return
    clearSelectionDraft()
    setFeedbackDraft(draft)
    setShowModal(true)
  }, [enabled, clearSelectionDraft])

  useEffect(function() {
    if (!enabled) return undefined
    const root = rootRef.current
    if (!root) return undefined

    function buildSelectionDraft() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString) return null
      const text = sel.toString().trim()
      if (!text || text.length < 2) return null
      const anchor = sel.anchorNode
      let node = anchor
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement
      if (!node || !node.closest) return null
      if (!node.closest('[data-lesson-feedback-root]')) return null
      if (node.closest('button, a, input, textarea, select, [data-no-lesson-feedback]')) return null

      const selectionInfo = findLessonSelectionPosition(root, sel, lesson)
      const context = selectionInfo
      const lessonId = lesson && lesson.id ? lesson.id : ''
      const sectionId = context.sectionId || 'general'
      const itemId = lessonContentFeedbackId(lessonId, sectionId, text)
      const title = lesson && lesson.title ? lesson.title : 'Lesson'

      return {
        itemId: itemId,
        lessonId: lessonId,
        type: 'lesson_content',
        title: title,
        sectionId: sectionId,
        sectionTitle: context.sectionTitle,
        selectedText: text,
        context: context.context,
        position: context.position,
      }
    }

    function syncSelectionDraft() {
      setSelectionDraft(buildSelectionDraft())
    }

    document.addEventListener('mouseup', syncSelectionDraft)
    document.addEventListener('selectionchange', syncSelectionDraft)
    return function() {
      document.removeEventListener('mouseup', syncSelectionDraft)
      document.removeEventListener('selectionchange', syncSelectionDraft)
      clearSelectionDraft()
    }
  }, [enabled, lesson, clearSelectionDraft])

  const openQuizFeedback = useCallback(function(question) {
    if (!enabled || !question || !lesson || !lesson.id) return
    openFeedback({
      itemId: lessonQuizFeedbackId(lesson.id, question.questionId),
      lessonId: lesson.id,
      type: 'lesson_quiz',
      title: lesson.title || 'Quiz',
      questionId: question.questionId || '',
      questionPrompt: question.questionPrompt || '',
      selectedText: question.questionPrompt || '',
      context: question.context || '',
    })
  }, [enabled, lesson, openFeedback])

  function handleFeedbackChanged() {
    setFeedbackCount(getAllLessonFeedback().length)
    setFeedbackRevision(function(n) { return n + 1 })
    if (typeof props.onFeedbackChange === 'function') props.onFeedbackChange()
  }

  const showToolbar = enabled && (feedbackCount > 0 || !!selectionDraft)
  const inlineToolbar = !!props.inlineToolbar
  const toolbar = showToolbar ? (
    <LessonFeedbackToolbar
      show={enabled}
      count={feedbackCount}
      selectionDraft={selectionDraft}
      onSuggest={function() { openFeedback(selectionDraft) }}
      onChanged={handleFeedbackChanged}
    />
  ) : null

  return (
    <>
      {showToolbar && !inlineToolbar ? (
        <div className="lesson-feedback-floating-anchor">
          {toolbar}
        </div>
      ) : null}
      <div ref={rootRef} data-lesson-feedback-root>
        {typeof props.children === 'function'
          ? props.children({
            openFeedback: openFeedback,
            openQuizFeedback: openQuizFeedback,
            enabled: enabled,
            toolbar: toolbar,
          })
          : props.children}
      </div>
      {enabled ? (
        <LessonFeedbackModal
          show={showModal}
          draft={feedbackDraft || {}}
          feedbackSyncKey={feedbackRevision}
          onChanged={handleFeedbackChanged}
          onHide={function() { setShowModal(false) }}
        />
      ) : null}
    </>
  )
}
