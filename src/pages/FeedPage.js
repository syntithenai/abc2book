import { useEffect, useRef, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useDocumentTitle } from '../pageTitle'
import FeedCard from '../components/FeedCard'
import StudyNavRail from '../components/StudyNavRail'
import './FeedPage.css'
import { getRecentViewedTuneIds } from '../tuneViewHistoryStore'
import {
  upsertFeedItems,
  prepareNavRefreshEligibility,
  getEligibleForStream,
  markShown,
  markDismissed,
  markExpanded,
  markAnswered,
} from '../feedItemStore'
import { getFeedProgress, incrementLearned, FEED_DAILY_GOAL } from '../feedProgressStore'
import { generateLocalFeedItems } from '../feedLocalGenerator'
import { buildFeedStream, getEffectiveTheorySkill } from '../feedMixer'
import {
  loadFeedContentModules,
  moduleToFeedItems,
  bundleContentQuizzes,
  modulesForSkill,
  FEED_SKILL_EXPAND_STEP,
  FEED_SKILL_EXPAND_MAX,
} from '../feedContentLoader'
import { loadPracticeSettings } from '../practiceSessionSettings'
import { runFeedEnrichment } from '../feedEnrichmentClient'
import { runFeedAiGeneration } from '../feedGenerationClient'
import { runFeedMusixmatchEnrichment } from '../feedMusixmatchClient'
import { planInjectWave, streamSeenMaps } from '../feedInjectUtils'
import { isFeedFeedbackAdmin } from '../feedFeedbackUtils'
import { downloadFeedFeedbackJson, getAllFeedFeedback, clearAllFeedFeedback } from '../feedFeedbackStore'

const PAGE_SIZE = 10
const INJECT_CAP = 3
/** TEMP: inspect AI cards only — set false to restore the full mixed feed. */
const FEED_AI_ONLY = false

function isAiFeedItem(item) {
  return !!(item && (item.generation === 'ai' || item.source === 'ai'))
}

function splitInstructional(items) {
  const pool = []
  const theory = []
  const singing = []
  const quizzes = []
  ;(items || []).forEach(function(item) {
    if (!item) return
    if (FEED_AI_ONLY && !isAiFeedItem(item)) return
    if (item.type === 'quiz' || item.type === 'theory_quiz') quizzes.push(item)
    else if (item.type === 'theory_lesson') theory.push(item)
    else if (item.type === 'singing_tip' || item.type === 'warmup_idea') singing.push(item)
    else pool.push(item)
  })
  return { pool: pool, theory: theory, singing: singing, quizzes: quizzes }
}

function contentItemsFromBundle(bundle, skill, expand) {
  const opts = { expand: expand > 0 ? expand : 0 }
  const theoryMods = modulesForSkill(bundle.theory || bundle.theoryModules, skill, opts)
  const singingMods = modulesForSkill(bundle.singing || bundle.singingModules, skill, opts)
  const out = []
  theoryMods.forEach(function(m) {
    moduleToFeedItems(m).forEach(function(it) { out.push(it) })
  })
  singingMods.forEach(function(m) {
    moduleToFeedItems(m).forEach(function(it) { out.push(it) })
  })
  bundleContentQuizzes(theoryMods.concat(singingMods)).forEach(function(it) { out.push(it) })
  return out
}

function upsertContentForSkill(bundle, skill, expand) {
  const fromContent = contentItemsFromBundle(bundle || { theory: [], singing: [] }, skill, expand)
  if (fromContent.length) upsertFeedItems(fromContent)
  return fromContent.length
}

export default function FeedPage(props) {
  useDocumentTitle('Feed')

  const location = useLocation()
  const tunes = props.tunes || {}
  const showFeedbackControls = isFeedFeedbackAdmin(props.user)
  const [stream, setStream] = useState([])
  const [pendingNew, setPendingNew] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [quizDone, setQuizDone] = useState({})
  const [progress, setProgress] = useState(function() { return getFeedProgress() })
  const [feedbackRevision, setFeedbackRevision] = useState(0)
  const [feedbackCount, setFeedbackCount] = useState(function() {
    return getAllFeedFeedback().length
  })
  const [updating, setUpdating] = useState(false)
  const [ready, setReady] = useState(false)
  const [caughtUp, setCaughtUp] = useState(false)
  const contentRef = useRef(null)
  const sentinelRef = useRef(null)
  const learnedExpandRef = useRef({})
  const streamIdsRef = useRef({})
  const streamHashesRef = useRef({})
  const pendingRef = useRef([])
  const loadingMoreRef = useRef(false)
  /** Extra difficulty levels above the preferred skill band (opens when feed is hungry). */
  const skillExpandRef = useRef(0)

  function rememberShown(items) {
    ;(items || []).forEach(function(item) {
      if (!item || !item.id) return
      markShown(item.id)
      streamIdsRef.current[item.id] = true
      if (item.factHash) streamHashesRef.current[item.factHash] = true
    })
  }

  function injectWave(newItems) {
    if (!newItems || !newItems.length) return
    const filtered = FEED_AI_ONLY ? newItems.filter(isAiFeedItem) : newItems
    if (!filtered.length) return
    upsertFeedItems(filtered)
    const nearTop = typeof window !== 'undefined' && window.scrollY < 80
    const pendingMaps = streamSeenMaps(pendingRef.current)
    const plan = planInjectWave({
      newItems: filtered,
      nearTop: nearTop,
      injectCap: INJECT_CAP,
      streamIds: streamIdsRef.current,
      streamHashes: streamHashesRef.current,
      pendingIds: pendingMaps.ids,
      pendingHashes: pendingMaps.hashes,
    })
    if (plan.prepend.length) {
      rememberShown(plan.prepend)
      setStream(function(prev) {
        return plan.prepend.concat(prev)
      })
    }
    if (plan.pending.length) {
      const nextPending = pendingRef.current.concat(plan.pending)
      pendingRef.current = nextPending
      setPendingNew(nextPending)
    }
  }

  function revealPending() {
    const toShow = pendingRef.current.slice()
    if (!toShow.length) return
    pendingRef.current = []
    setPendingNew([])
    rememberShown(toShow)
    setStream(function(prev) {
      const seen = streamSeenMaps(prev)
      const add = toShow.filter(function(w) {
        if (!w || !w.id || seen.ids[w.id]) return false
        if (w.factHash && seen.hashes[w.factHash]) return false
        seen.ids[w.id] = true
        if (w.factHash) seen.hashes[w.factHash] = true
        return true
      })
      return add.concat(prev)
    })
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }

  function rebuildStream(bundle) {
    prepareNavRefreshEligibility()
    pendingRef.current = []
    setPendingNew([])
    skillExpandRef.current = 0
    const skill = getEffectiveTheorySkill()
    const settings = loadPracticeSettings()
    const viewIds = getRecentViewedTuneIds(40)
    if (!FEED_AI_ONLY) {
      // Always refresh local tune cards (wiki/news/dyk/quiz) so the pool is not
      // only instructional content after the first visit.
      const local = generateLocalFeedItems({ tunes: tunes, viewIds: viewIds })
      if (local.length) upsertFeedItems(local)
      upsertContentForSkill(bundle, skill, 0)
    }
    const eligible = getEligibleForStream()
    const parts = splitInstructional(eligible)
    const page = buildFeedStream({
      poolItems: parts.pool,
      theoryItems: FEED_AI_ONLY ? [] : parts.theory,
      singingItems: FEED_AI_ONLY ? [] : parts.singing,
      quizItems: FEED_AI_ONLY ? [] : parts.quizzes,
      skill: skill,
      instrument: settings.instrument,
      pageSize: PAGE_SIZE,
    })
    streamIdsRef.current = {}
    streamHashesRef.current = {}
    rememberShown(page)
    setStream(page)
    setCaughtUp(false)
    setProgress(getFeedProgress())
    setReady(true)
  }

  useEffect(function() {
    var cancelled = false
    setReady(false)
    loadFeedContentModules().then(function(bundle) {
      if (cancelled) return
      contentRef.current = bundle
      rebuildStream(bundle)
      setUpdating(true)
      var chain = Promise.resolve()
      if (!FEED_AI_ONLY) {
        chain = chain.then(function() {
          return runFeedEnrichment({
            tunes: tunes,
            viewIds: getRecentViewedTuneIds(8),
            onItems: function(items) { if (!cancelled) injectWave(items) },
          })
        })
      }
      chain = chain.then(function() {
        try {
          if (FEED_AI_ONLY && typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('bookstorage_feed_ai_ran')
          }
        } catch (e) {
          // ignore
        }
        return runFeedAiGeneration({
          tunes: tunes,
          viewIds: getRecentViewedTuneIds(5),
          onItems: function(items) { if (!cancelled) injectWave(items) },
        })
      })
      if (!FEED_AI_ONLY) {
        chain = chain.then(function() {
          return runFeedMusixmatchEnrichment({
            tunes: tunes,
            viewIds: getRecentViewedTuneIds(3),
            onItems: function(items) { if (!cancelled) injectWave(items) },
          })
        })
      }
      chain.finally(function() {
        if (!cancelled) setUpdating(false)
      })
    }).catch(function() {
      if (!cancelled) rebuildStream({ theory: [], singing: [] })
    })
    return function() { cancelled = true }
    // Rebuild on every navigation to /feed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.key])

  useEffect(function() {
    const el = sentinelRef.current
    if (!el || !ready) return undefined
    const obs = new IntersectionObserver(function(entries) {
      if (!entries[0] || !entries[0].isIntersecting) return
      if (loadingMoreRef.current) return
      loadingMoreRef.current = true
      try {
        const skill = getEffectiveTheorySkill()
        const settings = loadPracticeSettings()
        const usedIds = streamIdsRef.current || {}
        const usedHashes = streamHashesRef.current || {}
        function notUsed(i) {
          if (!i || usedIds[i.id]) return false
          if (i.factHash && usedHashes[i.factHash]) return false
          return true
        }
        function buildMore() {
          const eligible = getEligibleForStream()
          const parts = splitInstructional(eligible)
          parts.pool = parts.pool.filter(notUsed)
          parts.theory = parts.theory.filter(notUsed)
          parts.singing = parts.singing.filter(notUsed)
          return buildFeedStream({
            poolItems: parts.pool,
            theoryItems: FEED_AI_ONLY ? [] : parts.theory,
            singingItems: FEED_AI_ONLY ? [] : parts.singing,
            quizItems: FEED_AI_ONLY ? [] : parts.quizzes,
            skill: skill,
            instrument: settings.instrument,
            pageSize: PAGE_SIZE,
          })
        }
        var more = buildMore()
        // Prefer low skill; open higher difficulties only when this band is exhausted.
        if (!more.length && !FEED_AI_ONLY && contentRef.current) {
          const preferMax = skill + 1
          const curCeiling = Math.min(FEED_SKILL_EXPAND_MAX, preferMax + skillExpandRef.current)
          if (curCeiling < FEED_SKILL_EXPAND_MAX) {
            skillExpandRef.current = Math.min(
              FEED_SKILL_EXPAND_MAX - preferMax,
              skillExpandRef.current + FEED_SKILL_EXPAND_STEP
            )
            upsertContentForSkill(contentRef.current, skill, skillExpandRef.current)
            more = buildMore()
          }
        }
        if (!more.length) {
          setCaughtUp(true)
          return
        }
        setCaughtUp(false)
        rememberShown(more)
        setStream(function(prev) { return prev.concat(more) })
      } finally {
        loadingMoreRef.current = false
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return function() { obs.disconnect() }
  }, [ready, stream.length])

  function handleExpand(item) {
    if (!item) return
    setExpandedId(item.id)
    markExpanded(item.id)
    if (!learnedExpandRef.current[item.id]) {
      learnedExpandRef.current[item.id] = true
      setProgress(incrementLearned())
    }
  }

  function handleDismiss(item) {
    if (!item) return
    markDismissed(item.id)
    setStream(function(prev) { return prev.filter(function(c) { return c.id !== item.id }) })
    if (expandedId === item.id) setExpandedId(null)
  }

  function handleQuizComplete(item, summary) {
    if (!item || quizDone[item.id]) return
    setQuizDone(function(prev) {
      const next = Object.assign({}, prev)
      next[item.id] = true
      return next
    })
    const correct = summary && summary.correctCount > 0
    markAnswered(item.id, { correct: !!correct })
    setProgress(incrementLearned())
  }

  function handleClearFeedback() {
    if (!feedbackCount) return
    if (!window.confirm('Clear all saved feed feedback? This cannot be undone.')) return
    clearAllFeedFeedback()
    setFeedbackCount(0)
    setFeedbackRevision(function(n) { return n + 1 })
  }

  return (
    <div className="feed-page" data-testid="feed-page">
      <StudyNavRail active="feed" tunebook={props.tunebook} />
      {showFeedbackControls && feedbackCount > 0 ? (
        <div className="feed-feedback-toolbar" data-testid="feed-feedback-toolbar">
          <button
            type="button"
            className="feed-feedback-download"
            data-testid="feed-feedback-download"
            title="Download feedback JSON"
            onClick={function() { downloadFeedFeedbackJson('feed-feedback.json') }}
          >
            Download feedback
          </button>
          <button
            type="button"
            className="feed-feedback-clear"
            data-testid="feed-feedback-clear"
            title="Clear all feedback"
            aria-label="Clear all feedback"
            onClick={handleClearFeedback}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="feed-progress" data-testid="feed-progress">
        <span>Today {progress.learnedCount}/{FEED_DAILY_GOAL}</span>
      </div>
      {pendingNew.length ? (
        <button
          type="button"
          className="feed-new-stories"
          data-testid="feed-new-stories"
          onClick={revealPending}
        >
          {pendingNew.length} new {pendingNew.length === 1 ? 'story' : 'stories'}
        </button>
      ) : null}
      {updating ? <div className="feed-updating">Updating stories…</div> : null}
      {!stream.length && ready ? (
        <div className="feed-empty" data-testid="feed-empty">
          {FEED_AI_ONLY
            ? 'Waiting for AI cards… Open a few tunes with background notes, ensure the resolver/LLM is up, then reload Feed.'
            : 'Open a few tunes, then come back — your feed fills from what you explore, plus short theory and singing tipbits.'}
        </div>
      ) : null}
      {FEED_AI_ONLY ? (
        <div className="feed-updating" data-testid="feed-ai-only-banner">
          TEMP: showing AI cards only
        </div>
      ) : null}
      {stream.map(function(item) {
        return (
          <FeedCard
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            tunes={tunes}
            tunebook={props.tunebook}
            user={props.user}
            feedbackSyncKey={feedbackRevision}
            onFeedbackChange={function() {
              setFeedbackCount(getAllFeedFeedback().length)
            }}
            onExpand={handleExpand}
            onDismiss={handleDismiss}
            onQuizComplete={handleQuizComplete}
          />
        )
      })}
      <div className="feed-scroll-sentinel" data-testid="feed-scroll-sentinel" ref={sentinelRef} />
      {caughtUp && stream.length ? (
        <div className="feed-caught-up" data-testid="feed-caught-up">
          You&apos;re caught up for now. Open more tunes or check back later for new stories.
        </div>
      ) : null}
    </div>
  )
}
