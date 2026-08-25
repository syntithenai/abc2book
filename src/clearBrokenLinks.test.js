import {
  groupLinkFailuresByTune,
  linkLabel,
  removeTuneLinkAtIndex,
  removeTuneLinksAtIndexes,
} from './clearBrokenLinks'

describe('clearBrokenLinks', function() {
  test('removeTuneLinkAtIndex drops one link', function() {
    const next = removeTuneLinkAtIndex({
      id: 't1',
      links: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    }, 1)
    expect(next.links.map(function(l) { return l.title })).toEqual(['a', 'c'])
  })

  test('removeTuneLinksAtIndexes removes highest indexes first', function() {
    const next = removeTuneLinksAtIndexes({
      id: 't1',
      links: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    }, [0, 2])
    expect(next.links.map(function(l) { return l.title })).toEqual(['b'])
  })

  test('groupLinkFailuresByTune groups by tune', function() {
    const groups = groupLinkFailuresByTune([
      { tuneId: 'a', tuneName: 'A', linkIndex: 0, error: 'x' },
      { tuneId: 'b', tuneName: 'B', linkIndex: 1, error: 'y' },
      { tuneId: 'a', tuneName: 'A', linkIndex: 2, error: 'z' },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].tuneId).toBe('a')
    expect(groups[0].failures).toHaveLength(2)
    expect(linkLabel({ title: 'Intro' }, 0)).toBe('Intro')
    expect(linkLabel({}, 3)).toBe('Link 4')
  })
})
