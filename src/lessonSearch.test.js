import {
  searchLessons,
  scoreSearchRecord,
  flattenManifestLessons,
  lessonAssetUrl,
  fetchLessonAssetJson,
  findManifestLesson,
  loadLessonById,
  loadLessonSearchIndex,
  clearLessonSearchCaches,
} from './lessonSearch'

describe('lessonSearch', function() {
  beforeEach(function() {
    clearLessonSearchCaches()
  })

  const index = [
    {
      id: 'a',
      title: 'Irish Overview',
      snippet: 'Comhaltas, sessions',
      section_titles: ['Overview', 'Sessions'],
      entity_names: ['Comhaltas'],
      key_points: ['Sessions anchor community life'],
      playlist_labels: ['Pub session footage'],
      tags: ['ireland'],
    },
    {
      id: 'b',
      title: 'Major Scales',
      snippet: 'theory foundations',
      section_titles: ['Scales'],
      entity_names: [],
      key_points: [],
      playlist_labels: [],
      tags: ['theory'],
    },
  ]

  test('scoreSearchRecord ranks title matches', function() {
    expect(scoreSearchRecord(index[0], 'irish')).toBeGreaterThan(scoreSearchRecord(index[1], 'irish'))
  })

  test('searchLessons returns ranked results', function() {
    const results = searchLessons(index, 'fleadh', 10)
    expect(results).toHaveLength(0)
    const sessionResults = searchLessons(index, 'sessions', 10)
    expect(sessionResults).toHaveLength(1)
    expect(sessionResults[0].id).toBe('a')
  })

  test('loadLessonSearchIndex caches the fetched index', async function() {
    const payload = [{ id: 'x', title: 'Test' }]
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: function() { return Promise.resolve(JSON.stringify(payload)) },
    })
    const first = await loadLessonSearchIndex()
    const second = await loadLessonSearchIndex()
    expect(first).toEqual(payload)
    expect(second).toEqual(payload)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('loadLessonById caches lessons by id', async function() {
    const lesson = { id: 'lesson-a', title: 'Lesson A' }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: function() { return Promise.resolve(JSON.stringify(lesson)) },
    })
    const first = await loadLessonById('lesson-a')
    const second = await loadLessonById('lesson-a')
    expect(first).toEqual(lesson)
    expect(second).toEqual(lesson)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('flattenManifestLessons walks track units', function() {
    const flat = flattenManifestLessons({
      tracks: [{
        id: 'regions',
        label: 'Regions',
        units: [{
          id: 'ireland',
          label: 'Ireland',
          lessons: [{ id: 'x', title: 'Lesson X' }],
        }],
      }],
    })
    expect(flat).toHaveLength(1)
    expect(flat[0].unitLabel).toBe('Ireland')
  })

  test('lessonAssetUrl prefixes PUBLIC_URL', function() {
    const prev = process.env.PUBLIC_URL
    process.env.PUBLIC_URL = '/app'
    expect(lessonAssetUrl('manifest.json')).toBe('/app/lessons/manifest.json')
    process.env.PUBLIC_URL = prev
  })

  test('findManifestLesson returns region from unit', function() {
    const manifest = {
      tracks: [{
        id: 'regions',
        units: [{
          id: 'celtic-ireland',
          region: 'ireland',
          lessons: [{ id: 'lesson-a', path: 'lesson-a.json', title: 'A' }],
        }],
      }],
    }
    const row = findManifestLesson(manifest, 'lesson-a')
    expect(row.region).toBe('ireland')
    expect(row.path).toBe('lesson-a.json')
  })

  test('fetchLessonAssetJson rejects SPA HTML fallback', async function() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: function() { return Promise.resolve('<!DOCTYPE html><html></html>') },
    })
    await expect(fetchLessonAssetJson('/lessons/manifest.json')).rejects.toThrow(/export_lessons/)
  })

  test('fetchLessonAssetJson can treat HTML fallback as missing asset', async function() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: function() { return Promise.resolve('<!DOCTYPE html><html></html>') },
    })
    await expect(fetchLessonAssetJson('/lessons/missing.json', { missingAsNotFound: true }))
      .rejects.toMatchObject({ code: 'LESSON_ASSET_NOT_FOUND' })
  })
})
