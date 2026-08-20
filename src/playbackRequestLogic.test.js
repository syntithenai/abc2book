import {
  normalizePendingLinkNum,
  pendingRequestMatchesRoute,
  routeMatchesPendingRequest,
  shouldKeepIntentWhenRouteNotReady,
  shouldBlockMidiStartForMediaRequest,
} from './playbackRequestLogic'
import { SAMPLE_TUNE_IDS } from './devSeed/sampleTunebookAbc'

describe('playbackRequestLogic', function() {
  test('normalizePendingLinkNum defaults null to 0', function() {
    expect(normalizePendingLinkNum(null)).toBe('0')
    expect(normalizePendingLinkNum(2)).toBe('2')
  })

  test('pendingRequestMatchesRoute matches midi by tune and playState', function() {
    const pending = {
      tuneId: SAMPLE_TUNE_IDS.cooleys,
      playState: 'playMidi',
      linkNum: null,
    }
    expect(pendingRequestMatchesRoute(pending, SAMPLE_TUNE_IDS.cooleys, 'playMidi', null)).toBe(true)
    expect(pendingRequestMatchesRoute(pending, SAMPLE_TUNE_IDS.amazingGrace, 'playMidi', null)).toBe(false)
    expect(pendingRequestMatchesRoute(pending, SAMPLE_TUNE_IDS.cooleys, 'playMedia', 0)).toBe(false)
  })

  test('pendingRequestMatchesRoute matches media link index', function() {
    const pending = {
      tuneId: SAMPLE_TUNE_IDS.amazingGrace,
      playState: 'playMedia',
      linkNum: 1,
    }
    expect(pendingRequestMatchesRoute(pending, SAMPLE_TUNE_IDS.amazingGrace, 'playMedia', 1)).toBe(true)
    expect(pendingRequestMatchesRoute(pending, SAMPLE_TUNE_IDS.amazingGrace, 'playMedia', 0)).toBe(false)
  })

  test('routeMatchesPendingRequest requires route ready and matching mode', function() {
    const pending = {
      tuneId: SAMPLE_TUNE_IDS.cooleys,
      playState: 'playMidi',
    }
    expect(routeMatchesPendingRequest(pending, {
      routeReady: false,
      activeTuneId: SAMPLE_TUNE_IDS.cooleys,
      routeMode: 'midi',
      activeLinkNum: '0',
    })).toBe(false)
    expect(routeMatchesPendingRequest(pending, {
      routeReady: true,
      activeTuneId: SAMPLE_TUNE_IDS.cooleys,
      routeMode: 'midi',
      activeLinkNum: '0',
    })).toBe(true)
    expect(routeMatchesPendingRequest(pending, {
      routeReady: true,
      activeTuneId: SAMPLE_TUNE_IDS.cooleys,
      routeMode: 'none',
      activeLinkNum: '0',
    })).toBe(false)
  })

  test('shouldKeepIntentWhenRouteNotReady keeps intent while route is none', function() {
    const pending = { tuneId: 'x', playState: 'playMidi' }
    expect(shouldKeepIntentWhenRouteNotReady(pending, 'none')).toBe(true)
    expect(shouldKeepIntentWhenRouteNotReady(null, 'none')).toBe(false)
    expect(shouldKeepIntentWhenRouteNotReady(pending, 'midi')).toBe(false)
  })

  test('shouldBlockMidiStartForMediaRequest only when media is still requested', function() {
    expect(shouldBlockMidiStartForMediaRequest('midi', 'playMedia')).toBe(true)
    expect(shouldBlockMidiStartForMediaRequest('midi', 'playMidi')).toBe(false)
    expect(shouldBlockMidiStartForMediaRequest('midi', null)).toBe(false)
    expect(shouldBlockMidiStartForMediaRequest('media', 'playMedia')).toBe(false)
  })
})
