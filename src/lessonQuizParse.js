/**
 * Parse lesson quiz markdown (Ireland manual format) into structured questions.
 */
import { buildQuizBundle } from './feedQuizUtils'

const QUESTION_HEADER_RE = /^###\s+Q(\d+)\.\s*(.+)$/m
const CHOICE_RE = /^-\s*([A-D])\)\s*(.+)$/m
const ANSWER_RE = /^\*\*Answer:\*\*\s*(.+)$/m

function parseAnswerValue(raw) {
  const text = String(raw || '').trim()
  const tf = text.match(/^(True|False)\b/i)
  if (tf) {
    const correct = tf[1].toLowerCase() === 'true'
    const explain = text.replace(/^(True|False)\s*[—–-]?\s*/i, '').trim()
    return { type: 'truefalse', letter: null, correct: correct, explain: explain }
  }
  const letter = text.match(/^([A-D])\b/i)
  if (letter) {
    const explain = text.replace(/^[A-D]\s*[—–-]?\s*/i, '').trim()
    return { type: 'mcq', letter: letter[1].toUpperCase(), explain: explain }
  }
  return { type: 'text', letter: null, correct: null, explain: text }
}

export function parseLessonQuizMarkdown(markdown) {
  const source = String(markdown || '').trim()
  if (!source) return []

  const chunks = source.split(/\n(?=###\s+Q\d+\.)/).filter(Boolean)
  const questions = []

  chunks.forEach(function(chunk) {
    const headerMatch = chunk.match(QUESTION_HEADER_RE)
    if (!headerMatch) return

    const qNum = headerMatch[1]
    const promptFromHeader = headerMatch[2].trim()
    let rest = chunk.slice(headerMatch.index + headerMatch[0].length).trim()
    const answerMatch = rest.match(ANSWER_RE)
    if (!answerMatch) return

    const answerBlock = answerMatch[1].trim()
    const beforeAnswer = rest.slice(0, answerMatch.index).trim()
    const parsedAnswer = parseAnswerValue(answerBlock)

    const choiceLines = beforeAnswer.split('\n').filter(function(line) {
      return CHOICE_RE.test(line.trim())
    })

    let prompt = beforeAnswer
    if (choiceLines.length) {
      const firstChoice = beforeAnswer.match(/^-\s*[A-D]\)/m)
      if (firstChoice && firstChoice.index != null) {
        prompt = beforeAnswer.slice(0, firstChoice.index).trim()
      }
    }
    if (!prompt) prompt = promptFromHeader
    prompt = prompt.replace(/\n+/g, ' ').trim()
    if (!prompt) return

    const qid = 'q' + qNum

    if (choiceLines.length >= 2) {
      const choices = choiceLines.map(function(line) {
        const m = line.trim().match(/^-\s*([A-D])\)\s*(.+)$/)
        return {
          id: m[1].toLowerCase(),
          text: m[2].trim(),
          correct: parsedAnswer.letter ? m[1].toUpperCase() === parsedAnswer.letter : false,
        }
      })
      questions.push({
        id: qid,
        type: 'mcq',
        prompt: prompt,
        choices: choices,
        explain: parsedAnswer.explain || '',
      })
      return
    }

    questions.push({
      id: qid,
      type: 'truefalse',
      prompt: prompt,
      choices: [
        { id: 'a', text: 'True', correct: parsedAnswer.correct === true },
        { id: 'b', text: 'False', correct: parsedAnswer.correct === false },
      ],
      explain: parsedAnswer.explain || '',
    })
  })

  return questions
}

export function lessonQuizBundleFromLesson(lesson, options) {
  const opts = options || {}
  let raw = null
  if (lesson && lesson.quiz && Array.isArray(lesson.quiz.questions)) {
    raw = lesson.quiz
  } else if (lesson && Array.isArray(lesson.quiz_questions) && lesson.quiz_questions.length) {
    raw = {
      id: lesson.id + '-quiz',
      title: (lesson.title || 'Lesson') + ' quiz',
      questions: lesson.quiz_questions,
    }
  } else if (lesson && lesson.quiz_markdown) {
    const questions = parseLessonQuizMarkdown(lesson.quiz_markdown)
    if (!questions.length) return null
    raw = {
      id: lesson.id + '-quiz',
      title: (lesson.title || 'Lesson') + ' quiz',
      questions: questions,
    }
  }
  if (!raw) return null
  return buildQuizBundle(raw, {
    shuffle: opts.shuffle !== false,
    targetCount: 999,
  })
}
