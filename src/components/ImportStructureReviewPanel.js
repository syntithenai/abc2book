import { Alert, Badge, ListGroup } from 'react-bootstrap'
import { blocksFromLyricLines, blocksToReviewSections } from '../tuneBlockModel'
import { assessTuneBlockStructure, recommendationLabel } from '../tuneBlockQualityAssessment'

/**
 * Side-by-side structure review before chord/lyric import commit.
 * Scratchpad compositor pairings pattern: one row per identified block.
 */
export default function ImportStructureReviewPanel(props) {
  const lyricLines = Array.isArray(props.lyricLines) ? props.lyricLines : []
  const chordChart = String(props.chordChart || '')
  const strainCount = Number(props.strainCount) || 0
  const blocks = props.blocks || blocksFromLyricLines(lyricLines, {
    chordChart: chordChart,
    chordSectionLabels: props.chordSectionLabels,
    title: props.title,
    composer: props.composer,
  })
  const sections = blocksToReviewSections(blocks)
  const assessment = assessTuneBlockStructure(blocks, { strainCount: strainCount })

  if (!sections.length) return null

  return (
    <div className="import-structure-review-panel mb-3">
      <div className="d-flex align-items-center gap-2 mb-2">
        <strong>Structure review</strong>
        <Badge bg={assessment.ok ? 'success' : 'warning'}>
          {sections.length} block{sections.length === 1 ? '' : 's'}
        </Badge>
        {strainCount > 0 ? (
          <Badge bg="secondary">{strainCount} strain{strainCount === 1 ? '' : 's'}</Badge>
        ) : null}
      </div>
      <Alert variant={assessment.ok ? 'light' : 'warning'} className="py-2 small mb-2">
        {assessment.summary}
        {' — '}
        <strong>{recommendationLabel(assessment.recommendation)}</strong>
      </Alert>
      <ListGroup className="import-structure-review-list">
        {sections.map(function(section, index) {
          const preview = (section.lyricLines || []).slice(0, 2).join(' / ')
          return (
            <ListGroup.Item key={index} className="py-2">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <strong>{section.label}</strong>
                  {section.chordMode && section.chordMode !== 'none' ? (
                    <Badge bg="info" className="ms-2">{section.chordMode}</Badge>
                  ) : null}
                  {preview ? (
                    <div className="small text-muted mt-1">{preview}</div>
                  ) : (
                    <div className="small text-muted mt-1">No lyric lines</div>
                  )}
                </div>
                {section.chordChart ? (
                  <code className="small text-muted" style={{ maxWidth: '40%' }}>
                    {(section.chordChart || '').split('\n')[0]}
                  </code>
                ) : null}
              </div>
              {(section.warnings || []).map(function(warning) {
                return (
                  <div key={warning} className="small text-warning mt-1">{warning}</div>
                )
              })}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
      {assessment.issues.length > 0 ? (
        <ul className="small text-muted mt-2 mb-0">
          {assessment.issues.map(function(issue, index) {
            return <li key={index}>{issue.message}</li>
          })}
        </ul>
      ) : null}
    </div>
  )
}
