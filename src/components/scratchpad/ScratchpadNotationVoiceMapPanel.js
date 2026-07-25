import { Form, Table } from 'react-bootstrap'
import { getTuneVoiceKeys } from '../../abcVoiceViewSettings'
import { NEW_VOICE_TARGET, SKIP_VOICE_TARGET } from '../../scratchpadNotationMerge'
import { voiceDisplayLabel } from '../../notation/notationDisplayAbc'

function voiceLabel(tune, voiceKey) {
  return voiceDisplayLabel(tune, voiceKey)
}

export default function ScratchpadNotationVoiceMapPanel(props) {
  const sourceTune = props.sourceTune
  const targetTune = props.targetTune
  const mapping = props.mapping || {}
  const onChange = props.onChange
  const sourceKeys = getTuneVoiceKeys(sourceTune)
  const targetKeys = getTuneVoiceKeys(targetTune)
  const mode = props.mode || 'merge'

  if (!sourceTune || !targetTune || !sourceKeys.length) return null

  function updateMapping(srcKey, value) {
    if (typeof onChange !== 'function') return
    onChange(Object.assign({}, mapping, { [srcKey]: value }))
  }

  return (
    <div className="scratchpad-notation-voice-map" data-testid="scratchpad-notation-voice-map">
      <p className="text-muted mb-2">
        Map scratchpad voices to voices on <strong>{targetTune.name || 'the tune'}</strong>.
        {mode === 'insert'
          ? ' Scratchpad bars will be inserted at the bar you choose next.'
          : (mode === 'replace'
            ? ' Selected voices will be replaced from the bar you choose next.'
            : ' Scratchpad notes and chords will be merged from the bar you choose next.')}
      </p>
      <Table bordered size="sm" className="mb-0">
        <thead>
          <tr>
            <th>Scratchpad voice</th>
            <th>{mode === 'replace' ? 'Replace on' : 'Apply to'}</th>
          </tr>
        </thead>
        <tbody>
          {sourceKeys.map(function(srcKey) {
            const value = mapping[srcKey] != null ? mapping[srcKey] : NEW_VOICE_TARGET
            return (
              <tr key={srcKey}>
                <td className="align-middle">{voiceLabel(sourceTune, srcKey)}</td>
                <td>
                  <Form.Select
                    size="sm"
                    value={value}
                    aria-label={'Map scratchpad voice ' + srcKey}
                    onChange={function(e) { updateMapping(srcKey, e.target.value) }}
                  >
                    {targetKeys.map(function(targetKey) {
                      return (
                        <option key={targetKey} value={targetKey}>
                          {voiceLabel(targetTune, targetKey)}
                        </option>
                      )
                    })}
                    <option value={NEW_VOICE_TARGET}>Add as new voice</option>
                    <option value={SKIP_VOICE_TARGET}>Skip</option>
                  </Form.Select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}
