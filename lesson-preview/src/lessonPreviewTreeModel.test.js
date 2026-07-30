import { buildPreviewTreeModel } from './lessonPreviewTreeModel'

describe('lessonPreviewTreeModel', function() {
  const manifest = {
    tracks: [
      {
        id: 'theory',
        label: 'Theory spine',
        units: [
          {
            id: 'theory-foundations',
            label: 'Foundations',
            lessons: [
              { id: 'theory-intervals-advanced', title: 'Intervals — Advanced', tier: 'advanced' },
              { id: 'theory-intervals-intro', title: 'Intervals — Introduction', tier: 'intro' },
            ],
          },
        ],
      },
      {
        id: 'regions',
        label: 'Regional Traditions',
        units: [
          { id: 'celtic-scotland', label: 'Celtic — Scotland', lessons: [{ id: 's1', title: 'Scotland', tier: 1 }] },
          { id: 'celtic-ireland', label: 'Celtic — Ireland', lessons: [{ id: 'i1', title: 'Ireland', tier: 1 }] },
        ],
      },
    ],
  }

  it('groups top-level sections with theory before regions', function() {
    const tree = buildPreviewTreeModel(manifest)
    expect(tree[0].label).toBe('Core theory')
    expect(tree[tree.length - 1].label).toBe('Regional traditions')
  })

  it('orders celtic nations with ireland before scotland', function() {
    const tree = buildPreviewTreeModel(manifest)
    const regions = tree.find(function(n) { return n.label === 'Regional traditions' })
    const celtic = regions.children.find(function(n) { return n.label === 'Celtic' })
    expect(celtic.children[0].label).toBe('Ireland')
    expect(celtic.children[1].label).toBe('Scotland')
  })

  it('orders theory subtopics by difficulty', function() {
    const tree = buildPreviewTreeModel(manifest)
    const theory = tree[0].children.find(function(n) { return n.id === 'folder:theory' })
    const foundations = theory.children.find(function(n) { return n.id === 'folder:theory-foundations' })
    const intervals = foundations.children.find(function(n) { return n.label === 'Intervals' })
    expect(intervals.children[0].lessonId).toBe('theory-intervals-intro')
    expect(intervals.children[1].lessonId).toBe('theory-intervals-advanced')
  })
})
