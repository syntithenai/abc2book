import { lessonImageSrc } from './lessonImageUtils'

describe('lessonImageUtils', function() {
  test('rewrites wikipedia Special:FilePath to commons', function() {
    const src = lessonImageSrc('https://en.wikipedia.org/wiki/Special:FilePath/Example.jpg?width=640')
    expect(src).toContain('commons.wikimedia.org/wiki/Special:FilePath/')
    expect(src).toContain('width=640')
  })
})
