export const LESSON_FEEDBACK_PRESETS = [
  { id: 'factually_wrong', label: 'Factually wrong' },
  { id: 'bad_phrasing', label: 'Bad phrasing' },
  { id: 'should_be_linked', label: 'Should be linked' },
  { id: 'add_source', label: 'Add source reference' },
  { id: 'remove_block', label: 'Remove block' },
  { id: 'not_useful', label: 'Not useful' },
]

export function lessonFeedbackPresetLabel(presetId) {
  const preset = LESSON_FEEDBACK_PRESETS.find(function(p) { return p.id === presetId })
  return preset ? preset.label : presetId
}
