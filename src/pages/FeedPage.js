import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import FeedCard from '../components/FeedCard'
import './FeedPage.css'
import { getRecentViewedTuneIds } from '../tuneViewHistoryStore'
import {
  loadFeedItems,
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
import { loadFeedContentModules, moduleToFeedItems, modulesForSkill } from '../feedContentLoader'
import { loadPracticeSettings } from '../practiceSessionSettings'
import { runFeedEnrichment } from '../feedEnrichmentClient'
import { runFeedAiGeneration } from '../feedGenerationClient'
import { runFeedMusixmatchEnrichment } from '../feedMusixmatchClient'

const PAGE_SIZE = 10
const INJECT_CAP = 3

function splitInstructional(items) {
  const pool = []
  const theory = []
  const singing = []
  ;(items || []).forEach(function(item) {
    if (!item) return
    if (item.type === 'theory_lesson' || item.type === 'theory_quiz') theory.push(item)
    else if (item.type === 'singing_tip' || item.type === 'warmup_idea') singing.push(item)
    else pool.push(item)
  })
  return { pool: pool, theory: theory, singing: singing }
}

function contentItemsFromBundle(bundle, skill, tune) {
  const theoryMods = modulesForSkill(bundle.theory || bundle.theoryModules, skill)
  const singingMods = modulesForSkill(bundle.singing || bundle.singingModules, skill)
  const out = []
  theoryMods.forEach(function(m) {
    moduleToFeedItems(m, { tune: tune }).forEach(function(it) { out.push(it) })
  })
  singingMods.forEach(function(m) {
    moduleToFeedItems(m, { tune: tune }).forEach(function(it) { out.push(it) })
  })
  return out
}

export default function FeedPage(props) {
  const location = useLocation()
  const tunes = props.tunes || {}
  const [stream, setStream] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [progress, setProgress] = useState(function() { return getFeedProgress() })
  const [updating, setUpdating] = useState(false)
  const [ready, setReady] = useState(false)
  const contentRef = useRef(null)
  const sentinelRef = useRef(null)
  const learnedExpandRef = useRef({})
  const streamIdsRef = useRef({})

  function injectWave(newItems) {
    if (!newItems || !newItems.length) return
    upsertFeedItems(newItems)
    const wave = newItems.filter(function(i) { return i && i.isNew }).slice(0, INJECT_CAP)
    if (!wave.length) return
    setStream(function(prev) {
      const ids = {}
      prev.forEach(function(p) { ids[p.id] = true })
      const add = wave.filter(function(w) { return w && w.id && !ids[w.id] })
      add.forEach(function(item) { markShown(item.id) })
      return add.concat(prev)
    })
  }

  function rebuildStream(bundle) {
    prepareNavRefreshEligibility()
    const skill = getEffectiveTheorySkill()
    const settings = loadPracticeSettings()
    const viewIds = getRecentViewedTuneIds(40)
    let pool = loadFeedItems()
    if (pool.length < 8) {
      const local = generateLocalFeedItems({ tunes: tunes, viewIds: viewIds })
      if (local.length) {
        upsertFeedItems(local)
        pool = loadFeedItems()
      }
    }
    const contextTune = viewIds[0] && tunes[viewIds[0]] ? tunes[viewIds[0]] : null
    const fromContent = contentItemsFromBundle(bundle || { theory: [], singing: [] }, skill, contextTune)
    if (fromContent.length) {
      upsertFeedItems(fromContent)
      pool = loadFeedItems()
    }
    const eligible = getEligibleForStream()
    const parts = splitInstructional(eligible)
    const page = buildFeedStream({
      poolItems: parts.pool,
      theoryItems: parts.theory,
      singingItems: parts.singing,
      skill: skill,
      instrument: settings.instrument,
      pageSize: PAGE_SIZE,
    })
    page.forEach(function(item) { markShown(item.id) })
    const idMap = {}
    page.forEach(function(i) { idMap[i.id] = true })
    streamIdsRef.current = idMap
    setStream(page)
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
      Promise.resolve()
        .then(function() {
          return runFeedEnrichment({
            tunes: tunes,
            viewIds: getRecentViewedTuneIds(8),
            onItems: function(items) { if (!cancelled) injectWave(items) },
          })
        })
        .then(function() {
          return runFeedAiGeneration({
            tunes: tunes,
            viewIds: getRecentViewedTuneIds(5),
            onItems: function(items) { if (!cancelled) injectWave(items) },
          })
        })
        .then(function() {
          return runFeedMusixmatchEnrichment({
            tunes: tunes,
            viewIds: getRecentViewedTuneIds(3),
            onItems: function(items) { if (!cancelled) injectWave(items) },
          })
        })
        .finally(function() {
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
    if (!el) return undefined
    const obs = new IntersectionObserver(function(entries) {
      if (!entries[0] || !entries[0].isIntersecting) return
      const eligible = getEligibleForStream()
      const parts = splitInstructional(eligible)
      const skill = getEffectiveTheorySkill()
      const settings = loadPracticeSettings()
      const used = streamIdsRef.current || {}
      parts.pool = parts.pool.filter(function(i) { return i && !used[i.id] })
      parts.theory = parts.theory.filter(function(i) { return i && !used[i.id] })
      parts.singing = parts.singing.filter(function(i) { return i && !used[i.id] })
      const more = buildFeedStream({
        poolItems: parts.pool,
        theoryItems: parts.theory,
        singingItems: parts.singing,
        skill: skill,
        instrument: settings.instrument,
        pageSize: PAGE_SIZE,
      })
      if (!more.length) return
      more.forEach(function(item) {
        markShown(item.id)
        used[item.id] = true
      })
      streamIdsRef.current = used
      setStream(function(prev) { return prev.concat(more) })
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

  function handleAnswer(item, choice) {
    if (!item || !choice) return
    const correct = !!choice.correct
    markAnswered(item.id, { correct: correct })
    setAnswers(function(prev) {
      const next = Object.assign({}, prev)
      next[item.id] = choice.id
      return next
    })
    setProgress(incrementLearned())
  }

  return (
    <div className="feed-page" data-testid="feed-page">
      <div className="feed-progress" data-testid="feed-progress">
        <span>Today {progress.learnedCount}/{FEED_DAILY_GOAL}</span>
        <span>Streak {progress.streak}</span>
      </div>
      {updating ? <div className="feed-updating">Updating stories…</div> : null}
      {!stream.length && ready ? (
        <div className="feed-empty" data-testid="feed-empty">
          Open a few tunes, then come back — your feed fills from what you explore, plus short theory and singing tipbits.
        </div>
      ) : null}
      {stream.map(function(item) {
        return (
          <FeedCard
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            answeredChoiceId={answers[item.id]}
            onExpand={handleExpand}
            onDismiss={handleDismiss}
            onAnswer={handleAnswer}
          />
        )
      })}
      <div className="feed-scroll-sentinel" data-testid="feed-scroll-sentinel" ref={sentinelRef} />
    </div>
  )
}
