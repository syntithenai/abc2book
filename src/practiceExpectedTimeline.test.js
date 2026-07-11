import { generateScaleWarmup } from './practiceWarmupGenerator'
import {
  parseWarmupAbcHeaders,
  noteEventsFromWarmupAbc,
  expandTimelineForRep,
  noteWindowsFromTimeline,
  beatToMs,
  expectedNoteAtBeat,
  notationBeatFromAudioSeconds,
} from './practiceExpectedTimeline'

describe('practiceExpectedTimeline', function() {
  test('parses warmup ABC headers and body', function() {
    const warmup = generateScaleWarmup({ key: 'D' })
    const parsed = parseWarmupAbcHeaders(warmup.abc)
    expect(parsed.headers.K).toBe('D')
    expect(parsed.headers.M).toBe('4/4')
    expect(parsed.body.length).toBeGreaterThan(5)
  })

  test('builds note events from scale warmup', function() {
    const warmup = generateScaleWarmup({ key: 'C' })
    const timeline = noteEventsFromWarmupAbc(warmup.abc)
    expect(timeline.notes.length).toBeGreaterThan(4)
    expect(timeline.notes[0].midi).toBeGreaterThan(0)
    expect(timeline.patternDurationBeats).toBeGreaterThan(0)
  })

  test('expands timeline for repeat with gap', function() {
    const warmup = generateScaleWarmup({ key: 'G' })
    const timeline = noteEventsFromWarmupAbc(warmup.abc)
    const rep1 = expandTimelineForRep(timeline, 1, 1)
    expect(rep1[0].startBeat).toBeGreaterThan(timeline.notes[0].startBeat)
    expect(rep1[0].repIndex).toBe(1)
  })

  test('note windows map beats to milliseconds', function() {
    const warmup = generateScaleWarmup({ key: 'C', tempo: 90 })
    const timeline = noteEventsFromWarmupAbc(warmup.abc)
    const windows = noteWindowsFromTimeline(timeline.notes, timeline.tuneMeta, 500)
    expect(windows[0].startMs).toBe(500)
    expect(windows[1].startMs).toBeGreaterThan(windows[0].startMs)
  })

  test('expectedNoteAtBeat finds current note', function() {
    const warmup = generateScaleWarmup({ key: 'C' })
    const timeline = noteEventsFromWarmupAbc(warmup.abc)
    const first = timeline.notes[0]
    const found = expectedNoteAtBeat(timeline.notes, first.startBeat + 0.01)
    expect(found).not.toBeNull()
    expect(found.midi).toBe(first.midi)
  })

  test('notationBeatFromAudioSeconds maps playback time to notation beats', function() {
    const warmup = generateScaleWarmup({ key: 'C', tempo: 90 })
    const timeline = noteEventsFromWarmupAbc(warmup.abc)
    const atStart = notationBeatFromAudioSeconds(0, timeline.tuneMeta, 0, timeline.patternDurationBeats, 1)
    expect(atStart).toBeCloseTo(0, 5)
    const msPerBeat = beatToMs(1, timeline.tuneMeta.tempoBpm, timeline.tuneMeta.beatUnit)
    const oneBeatSec = msPerBeat / 1000
    const atOneBeat = notationBeatFromAudioSeconds(oneBeatSec, timeline.tuneMeta, 0, timeline.patternDurationBeats, 1)
    expect(atOneBeat).toBeCloseTo(1, 3)
    const rep1Beat = notationBeatFromAudioSeconds(0, timeline.tuneMeta, 1, timeline.patternDurationBeats, 1)
    expect(rep1Beat).toBeCloseTo(timeline.patternDurationBeats + 1, 3)
  })

  test('beatToMs at 90 BPM quarter note', function() {
    expect(beatToMs(1, 90, 0.25)).toBeCloseTo(666.67, 0)
  })
})
