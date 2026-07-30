#!/usr/bin/env node
/**
 * API smoke test for Snapcast playback routes on a running local resolver.
 *
 * Prerequisites:
 *   Resolver with snapcast profile (ffmpeg + snapserver optional for full PCM).
 *   REQUIRE_AUTH=false or SNAPCAST_TEST_AUTH_TOKEN set.
 *
 * Usage:
 *   SNAPCAST_TEST_RESOLVER_URL=http://127.0.0.1:8787 npm run test:snapcast:e2e
 */
'use strict'

const RESOLVER_URL = (process.env.SNAPCAST_TEST_RESOLVER_URL || '').replace(/\/$/, '')
const AUTH_TOKEN = process.env.SNAPCAST_TEST_AUTH_TOKEN || ''
const TEST_SOURCE = process.env.SNAPCAST_TEST_SOURCE || 'https://example.com/test.mp3'

const results = []

function pass(name) {
  results.push({ name: name, ok: true })
  console.log('  ok', name)
}

function fail(name, err) {
  results.push({ name: name, ok: false, error: err.message || String(err) })
  console.error(' FAIL', name)
  console.error('     ', err.message || err)
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (AUTH_TOKEN) {
    headers.Authorization = 'Bearer ' + AUTH_TOKEN
  }
  return headers
}

async function request(path, options) {
  const url = RESOLVER_URL + path
  const response = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options && options.headers ? options.headers : {}) },
    signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch (_err) {
    body = text
  }
  return { response: response, body: body }
}

async function run() {
  if (!RESOLVER_URL) {
    console.error('Set SNAPCAST_TEST_RESOLVER_URL (e.g. http://127.0.0.1:8787)')
    process.exit(1)
  }

  console.log('Snapcast smoke against', RESOLVER_URL)

  try {
    const health = await request('/health')
    if (!health.response.ok) {
      throw new Error('health returned ' + health.response.status)
    }
    if (!health.body || !health.body.snapcast || !health.body.snapcast.enabled) {
      throw new Error('snapcast.enabled is false — start resolver with snapcast profile')
    }
    if (!health.body.cast || !health.body.cast.enabled) {
      throw new Error('cast.enabled is false — ffmpeg required')
    }
    pass('health-snapcast-and-cast-enabled')

    const create = await request('/snapcast-playback/session', {
      method: 'POST',
      body: JSON.stringify({
        source: TEST_SOURCE,
        sourceType: 'audio',
        duration: 30,
      }),
    })
    if (!create.response.ok) {
      throw new Error('create session failed: ' + create.response.status + ' ' + JSON.stringify(create.body))
    }
    const sessionId = create.body && create.body.sessionId
    if (!sessionId) {
      throw new Error('missing sessionId in create response')
    }
    pass('create-session')

    const status = await request('/snapcast-playback/session/' + encodeURIComponent(sessionId) + '/status')
    if (!status.response.ok || !status.body || status.body.sessionId !== sessionId) {
      throw new Error('status check failed')
    }
    pass('session-status')

    const pause = await request('/snapcast-playback/plugin', {
      method: 'POST',
      body: JSON.stringify({ action: 'pause' }),
    })
    if (!pause.response.ok || !pause.body || !pause.body.ok) {
      throw new Error('plugin pause failed')
    }
    pass('plugin-pause')

    const deleted = await request('/snapcast-playback/session/' + encodeURIComponent(sessionId), {
      method: 'DELETE',
    })
    if (!deleted.response.ok || !deleted.body || !deleted.body.ok) {
      throw new Error('delete session failed')
    }
    pass('delete-session')
  } catch (err) {
    fail('snapcast-smoke', err)
  }

  const failed = results.filter(function(item) { return item.ok === false })
  if (failed.length) {
    process.exit(1)
  }
  console.log('\nAll', results.length, 'checks passed.')
}

run()
