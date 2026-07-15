import {
  appendStrokePoint,
  createStroke,
  drawStrokeOnContext,
} from './fileDrawStrokeUtils'

describe('fileDrawStrokeUtils', function() {
  test('createStroke and appendStrokePoint build pen strokes', function() {
    const stroke = createStroke('pen', '#c62828', 4)
    expect(stroke.tool).toBe('pen')
    expect(stroke.color).toBe('#c62828')
    appendStrokePoint(stroke, 1, 2, 0.8)
    appendStrokePoint(stroke, 3, 4, 0.5)
    expect(stroke.points).toHaveLength(2)
    expect(stroke.points[0].x).toBe(1)
  })

  test('drawStrokeOnContext does not throw on empty canvas mock', function() {
    const calls = []
    const ctx = {
      save: function() { calls.push('save') },
      restore: function() { calls.push('restore') },
      beginPath: function() {},
      moveTo: function() {},
      lineTo: function() {},
      quadraticCurveTo: function() {},
      stroke: function() {},
      fill: function() {},
      arc: function() {},
    }
    const stroke = createStroke('eraser', '#000', 8)
    appendStrokePoint(stroke, 10, 10, 1)
    drawStrokeOnContext(ctx, stroke)
    expect(calls).toContain('save')
    expect(calls).toContain('restore')
  })
})
