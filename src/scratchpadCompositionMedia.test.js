import {
  compositionMediaAttachments,
  addCompositionMediaAttachment,
  removeCompositionMediaAttachment,
  createCompositionMediaAttachmentDraft,
} from './scratchpadCompositionMedia'
import { blankCompositionState } from './scratchpadStore'

describe('scratchpadCompositionMedia', function() {
  test('addCompositionMediaAttachment appends ordered entries', function() {
    const composition = blankCompositionState('c1', 'Comp')
    const draft = createCompositionMediaAttachmentDraft('item1', { title: 'Verse demo', order: 0 })
    const next = addCompositionMediaAttachment(composition, draft)
    expect(compositionMediaAttachments(next).length).toBe(1)
    expect(compositionMediaAttachments(next)[0].title).toBe('Verse demo')
  })

  test('removeCompositionMediaAttachment drops entry by id', function() {
    const draft = createCompositionMediaAttachmentDraft('item1', { title: 'A' })
    let composition = addCompositionMediaAttachment(blankCompositionState('c1', 'Comp'), draft)
    composition = removeCompositionMediaAttachment(composition, draft.id)
    expect(compositionMediaAttachments(composition).length).toBe(0)
  })
})
