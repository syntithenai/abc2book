import { useMemo } from 'react'
import { Alert } from 'react-bootstrap'
import { buildAbcFromTune, NotationPreview } from '../SuggestionPreviewDialog'
import { applyScratchpadNotationMerge } from '../../scratchpadNotationMerge'

function hasNotationPreview(tune) {
  return !!String(buildAbcFromTune(tune) || '').trim()
}

export default function ScratchpadNotationReplacePreview(props) {
  const tune = props.tune
  const sourceTune = props.sourceTune
  const voiceMapping = props.voiceMapping

  const mergedTune = useMemo(function() {
    if (!tune || !sourceTune) return null
    return applyScratchpadNotationMerge(tune, sourceTune, {
      mode: 'replace',
      voiceMapping: voiceMapping,
    })
  }, [tune, sourceTune, voiceMapping])

  if (!tune || !sourceTune) return null

  const beforeAbc = buildAbcFromTune(tune)
  const afterAbc = buildAbcFromTune(mergedTune)
  const tuneName = tune.name || 'tune'
  const scratchpadTitle = props.sourceTitle || 'scratchpad notation'

  return (
    <div className="scratchpad-notation-replace-preview" data-testid="scratchpad-notation-replace-preview">
      <p className="mb-3">
        Replace notation on <strong>{tuneName}</strong> with <strong>{scratchpadTitle}</strong>?
      </p>
      <div className="row g-3">
        <div className="col-md-6" style={{ minWidth: 0 }}>
          <div className="small text-muted mb-1">Current</div>
          {hasNotationPreview(tune) ? (
            <NotationPreview abc={beforeAbc} fitWidth={true} maxHeight="40vh" />
          ) : (
            <Alert variant="secondary" className="mb-0">No notation on this tune yet.</Alert>
          )}
        </div>
        <div className="col-md-6" style={{ minWidth: 0 }}>
          <div className="small text-muted mb-1">After replace</div>
          {hasNotationPreview(mergedTune) ? (
            <NotationPreview abc={afterAbc} fitWidth={true} maxHeight="40vh" />
          ) : (
            <Alert variant="secondary" className="mb-0">Scratchpad has no notation to apply.</Alert>
          )}
        </div>
      </div>
    </div>
  )
}
