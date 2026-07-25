jest.mock('react-toastify', function() {
  return {
    toast: {
      success: jest.fn(),
    },
  }
})

import { toast } from 'react-toastify'
import {
  editorPathForScratchpadAssociate,
  showScratchpadAssociateSuccessToast,
} from './scratchpadAssociateToast'

describe('scratchpadAssociateToast', function() {
  beforeEach(function() {
    toast.success.mockClear()
  })

  test('editorPathForScratchpadAssociate opens music tab for notation modes', function() {
    expect(editorPathForScratchpadAssociate('notation', 'abc123')).toBe('/editor/abc123/music')
    expect(editorPathForScratchpadAssociate('notation:merge', 'abc123')).toBe('/editor/abc123/music')
    expect(editorPathForScratchpadAssociate('background', 'abc123')).toBe('/editor/abc123')
  })

  test('showScratchpadAssociateSuccessToast renders Open tune button', function() {
    const onOpenTune = jest.fn()
    const closeToast = jest.fn()
    showScratchpadAssociateSuccessToast({
      message: 'Merged into Copper Kettle',
      tuneId: 'tune-1',
      onOpenTune: onOpenTune,
    })
    expect(toast.success).toHaveBeenCalledTimes(1)
    const renderFn = toast.success.mock.calls[0][0]
    const rendered = renderFn({ closeToast: closeToast })
    const button = rendered.props.children.find(function(child) {
      return child && child.props && child.props['data-testid'] === 'scratchpad-associate-open-tune'
    })
    expect(button).toBeTruthy()
    expect(button.props.children).toBe('Open tune')
    button.props.onClick()
    expect(closeToast).toHaveBeenCalled()
    expect(onOpenTune).toHaveBeenCalledWith('tune-1')
  })
})
