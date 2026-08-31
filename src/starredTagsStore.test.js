import {
  STARRED_TAGS_STORAGE_KEY,
  getStarredTags,
  isTagStarred,
  setTagStarred,
  toggleTagStarred,
} from './starredTagsStore'

describe('starredTagsStore', function() {
  beforeEach(function() {
    localStorage.removeItem(STARRED_TAGS_STORAGE_KEY)
  })

  it('starts empty', function() {
    expect(getStarredTags()).toEqual([])
    expect(isTagStarred('session')).toBe(false)
  })

  it('stars and unstars tags, newest first', function() {
    setTagStarred('reel', true)
    setTagStarred('jig', true)
    expect(getStarredTags()).toEqual(['jig', 'reel'])
    expect(isTagStarred('reel')).toBe(true)
    setTagStarred('reel', false)
    expect(getStarredTags()).toEqual(['jig'])
  })

  it('toggleTagStarred flips and returns next state', function() {
    expect(toggleTagStarred('waltz')).toBe(true)
    expect(getStarredTags()).toEqual(['waltz'])
    expect(toggleTagStarred('waltz')).toBe(false)
    expect(getStarredTags()).toEqual([])
  })

  it('ignores blank tags and dedupes case-insensitively', function() {
    setTagStarred('  ', true)
    setTagStarred('Session', true)
    setTagStarred('session', true)
    expect(getStarredTags()).toEqual(['session'])
  })
})
