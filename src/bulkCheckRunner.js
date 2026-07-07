import {
  checkAudioLinkPlayback,
  checkRecordingLinkPlayback,
  getEmptyLinkReason,
  getLinkSrcType,
  LINK_CHECK_TIMEOUT_AUDIO_MS,
  LINK_CHECK_TIMEOUT_YOUTUBE_MS,
} from './checkTuneLinkPlayback'
import { isAbortError } from './abortUtils'
import {
  buildBulkCheckSessionBase,
  getBulkCheckSession,
  patchBulkCheckSession,
} from './bulkCheckSessionStore'

const YT_PLAYING = 1

function formatLinkLabel(link, linkIndex) {
  const title = link && link.title && link.title.trim()
  if (title) return title
  return 'Link ' + (linkIndex + 1)
}

let running = false
let runMode = null
let abortController = null
const listeners = new Set()

let youtubeProbeId = 0
let youtubeProbe = null
let youtubeResolve = null
let youtubeTimeout = null

function notify() {
  listeners.forEach(function(listener) { listener() })
}

export function subscribeBulkCheckRunner(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function isBulkCheckRunnerActive() {
  return running
}

export function getBulkCheckRunMode() {
  return runMode
}

export function getBulkCheckYoutubeProbe() {
  return youtubeProbe
}

function clearYoutubeTimeout() {
  if (youtubeTimeout) {
    clearTimeout(youtubeTimeout)
    youtubeTimeout = null
  }
}

function settleYoutubeProbe(result) {
  if (!youtubeResolve) return
  const resolve = youtubeResolve
  youtubeResolve = null
  clearYoutubeTimeout()
  youtubeProbe = null
  notify()
  resolve(result)
}

export function reportBulkCheckYoutubeReady(player) {
  if (!youtubeProbe || !player) return
  try {
    player.mute()
    player.setVolume(0)
    player.playVideo()
  } catch (e) {
    settleYoutubeProbe({ ok: false, error: 'YouTube playback failed' })
  }
}

export function reportBulkCheckYoutubeState(stateCode) {
  if (stateCode === YT_PLAYING) {
    settleYoutubeProbe({ ok: true })
  }
}

export function reportBulkCheckYoutubeError() {
  settleYoutubeProbe({ ok: false, error: 'YouTube playback failed' })
}

function checkYoutubeLink(videoId, signal) {
  return new Promise(function(resolve) {
    if (!videoId) {
      resolve({ ok: false, error: 'Invalid YouTube link' })
      return
    }
    if (signal && signal.aborted) {
      resolve({ ok: false, error: 'cancelled' })
      return
    }

    youtubeProbeId += 1
    const probeId = youtubeProbeId
    youtubeResolve = resolve
    youtubeProbe = { id: probeId, videoId: videoId }
    notify()

    youtubeTimeout = setTimeout(function() {
      settleYoutubeProbe({ ok: false, error: 'Timed out waiting for YouTube playback' })
    }, LINK_CHECK_TIMEOUT_YOUTUBE_MS)

    if (signal) {
      signal.addEventListener('abort', function onAbort() {
        signal.removeEventListener('abort', onAbort)
        settleYoutubeProbe({ ok: false, error: 'cancelled' })
      })
    }
  })
}

function beginRun(mode) {
  running = true
  runMode = mode || null
  notify()
}

function endRun() {
  running = false
  runMode = null
  abortController = null
  notify()
}

export function cancelBulkCheckRun() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  settleYoutubeProbe({ ok: false, error: 'cancelled' })
  endRun()
}

function updateSession(selectionKey, patch) {
  patchBulkCheckSession(selectionKey, patch)
}

async function runLinkChecks(options, collectedFailures) {
  const queue = options.queue || []
  const signal = options.signal
  let completed = 0

  for (let i = 0; i < queue.length; i++) {
    if (signal.aborted) break

    const item = queue[i]
    const linkLabel = formatLinkLabel(item.link, item.linkIndex)
    const progressMessage = 'Checking "' + item.tuneName + '" — ' + linkLabel
      + ' (' + (i + 1) + ' of ' + queue.length + ')'

    updateSession(options.selectionKey, {
      phase: 'running-links',
      links: {
        progressMessage: progressMessage,
        checkedCount: completed,
        totalCount: queue.length,
        progressPercent: queue.length ? Math.round((completed / queue.length) * 100) : 0,
        failures: collectedFailures.slice(),
      },
    })

    const emptyReason = getEmptyLinkReason(item.link)
    let result
    if (emptyReason) {
      result = { ok: false, error: emptyReason }
    } else {
      const srcType = getLinkSrcType(item.link, options.isYoutubeLink)
      const src = String(item.link.link).trim()
      if (srcType === 'youtube') {
        result = await checkYoutubeLink(options.youtubeGetId(src), signal)
      } else if (srcType === 'recording') {
        result = await checkRecordingLinkPlayback(item.link, item.tuneId, item.linkIndex, {
          signal: signal,
          accessToken: options.accessToken,
          driveApi: options.driveApi,
        })
      } else {
        result = await checkAudioLinkPlayback(src, {
          signal: signal,
          timeoutMs: LINK_CHECK_TIMEOUT_AUDIO_MS,
        })
      }
    }

    if (signal.aborted) break

    completed += 1
    if (!result.ok) {
      collectedFailures.push(Object.assign({}, item, {
        error: result.error || 'Playback failed',
      }))
    }

    updateSession(options.selectionKey, {
      phase: 'running-links',
      links: {
        progressMessage: progressMessage,
        checkedCount: completed,
        totalCount: queue.length,
        progressPercent: Math.round((completed / queue.length) * 100),
        failures: collectedFailures.slice(),
      },
    })
  }

  return completed
}

export function startBulkCheckStaticRun(options) {
  if (!options || !options.selectionKey) return
  if (running) cancelBulkCheckRun()

  const selectionKey = options.selectionKey
  const queueLength = options.queueLength != null ? options.queueLength : 0
  const staticResults = options.staticResults || {
    completeness: [],
    abc: [],
    warnings: [],
  }

  beginRun('static')
  updateSession(selectionKey, Object.assign({}, buildBulkCheckSessionBase(selectionKey, queueLength), {
    phase: 'running-static',
    hasRun: true,
    links: {
      failures: [],
      warnings: staticResults.warnings || [],
      progressMessage: 'Analyzing records...',
      checkedCount: 0,
      totalCount: queueLength,
      progressPercent: 100,
    },
    completeness: { issues: staticResults.completeness || [] },
    abcCorrectness: { issues: staticResults.abc || [] },
  }))

  updateSession(selectionKey, {
    phase: 'static-done',
    hasRun: true,
    links: {
      progressMessage: 'Record check complete. Use Check Links to test playback.',
      progressPercent: 100,
      warnings: staticResults.warnings || [],
    },
    completeness: { issues: staticResults.completeness || [] },
    abcCorrectness: { issues: staticResults.abc || [] },
  })
  endRun()
}

export async function startBulkCheckLinkRun(options) {
  if (!options || !options.selectionKey) return
  if (running) cancelBulkCheckRun()

  const selectionKey = options.selectionKey
  const queue = options.queue || []
  const existing = getBulkCheckSession(selectionKey)
  const warnings = existing && existing.links ? existing.links.warnings : (options.warnings || [])

  beginRun('links')
  abortController = new AbortController()
  const signal = abortController.signal

  if (!queue.length) {
    updateSession(selectionKey, {
      phase: 'static-done',
      linksChecked: true,
      links: {
        failures: [],
        warnings: warnings,
        progressMessage: 'No links to check.',
        checkedCount: 0,
        totalCount: 0,
        progressPercent: 100,
      },
    })
    endRun()
    return
  }

  updateSession(selectionKey, {
    phase: 'running-links',
    links: {
      progressMessage: 'Starting link playback check...',
      checkedCount: 0,
      totalCount: queue.length,
      progressPercent: 0,
      failures: [],
      warnings: warnings,
    },
  })

  try {
    const collectedFailures = []
    const completed = await runLinkChecks({
      selectionKey: selectionKey,
      queue: queue,
      signal: signal,
      isYoutubeLink: options.isYoutubeLink,
      youtubeGetId: options.youtubeGetId,
      accessToken: options.accessToken,
      driveApi: options.driveApi,
    }, collectedFailures)

    if (signal.aborted) {
      updateSession(selectionKey, {
        phase: 'static-done',
        linksChecked: false,
        links: {
          failures: collectedFailures,
          warnings: warnings,
          progressMessage: 'Link check cancelled.',
          checkedCount: completed,
          totalCount: queue.length,
          progressPercent: queue.length ? Math.round((completed / queue.length) * 100) : 0,
        },
      })
    } else {
      const finalMessage = collectedFailures.length
        ? 'Link check finished — ' + collectedFailures.length + ' link(s) failed.'
        : 'All ' + queue.length + ' link(s) played successfully.'
      updateSession(selectionKey, {
        phase: 'links-done',
        linksChecked: true,
        links: {
          failures: collectedFailures,
          warnings: warnings,
          progressMessage: finalMessage,
          checkedCount: completed,
          totalCount: queue.length,
          progressPercent: 100,
        },
      })
    }
  } catch (err) {
    if (!isAbortError(err)) {
      const session = getBulkCheckSession(selectionKey)
      const failures = session && session.links ? session.links.failures : []
      updateSession(selectionKey, {
        phase: 'static-done',
        links: {
          progressMessage: err && err.message ? err.message : 'Link check failed.',
          failures: failures,
        },
      })
    }
  } finally {
    endRun()
  }
}

/** @deprecated use startBulkCheckStaticRun */
export function startBulkCheckRun(options) {
  startBulkCheckStaticRun(options)
}
