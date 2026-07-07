import { Alert, Button, Form } from 'react-bootstrap'
import SearchProgressBar from '../SearchProgressBar'
import YouTubeSearchModal from '../YouTubeSearchModal'

export const NEW_LINK_INDEX = -1

export function formatLinkLabel(link, linkIndex) {
  const title = link && link.title && link.title.trim()
  if (title) return title
  return 'Link ' + (linkIndex + 1)
}

export function groupFailuresByTune(failures) {
  const byTune = {}
  failures.forEach(function(item) {
    if (!byTune[item.tuneId]) {
      byTune[item.tuneId] = {
        tuneId: item.tuneId,
        tuneName: item.tuneName,
        composer: item.composer,
        failures: [],
      }
    }
    byTune[item.tuneId].failures.push(item)
  })
  return Object.values(byTune)
}

export function groupWarningsByTune(warnings) {
  const byTune = {}
  warnings.forEach(function(item) {
    if (!byTune[item.tuneId]) {
      byTune[item.tuneId] = {
        tuneId: item.tuneId,
        tuneName: item.tuneName,
        composer: item.composer,
        warnings: [],
      }
    }
    byTune[item.tuneId].warnings.push(item)
  })
  return Object.values(byTune)
}

export function LinkAllocationRow({
  tuneId,
  tuneName,
  composer,
  linkIndex,
  link,
  error,
  backgroundColor,
  linkEdits,
  onEditChange,
  onSaveManual,
  onApplyYoutube,
  tunebook,
  setBlockKeyboardShortcuts,
}) {
  const label = linkIndex === NEW_LINK_INDEX
    ? 'Add a link'
    : formatLinkLabel(link, linkIndex)

  function editKey() {
    return tuneId + ':' + linkIndex
  }

  const value = Object.prototype.hasOwnProperty.call(linkEdits, editKey())
    ? linkEdits[editKey()]
    : (link && link.link ? link.link : '')

  return (
    <div
      style={{
        padding: '0.75em',
        borderTop: '1px solid #ddd',
        background: backgroundColor,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '0.25em' }}>{label}</div>
      {link && link.link && (
        <div style={{ fontSize: '0.9em', wordBreak: 'break-all', marginBottom: '0.35em', color: '#555' }}>
          {link.link}
        </div>
      )}
      {error && (
        <Alert variant="danger" style={{ padding: '0.35em 0.6em', marginBottom: '0.5em' }}>
          {error}
        </Alert>
      )}
      <Form.Group style={{ marginBottom: '0.5em' }}>
        <Form.Label>{linkIndex === NEW_LINK_INDEX ? 'Link URL' : 'Replace link URL'}</Form.Label>
        <Form.Control
          type="text"
          value={value}
          onChange={function(e) {
            onEditChange(tuneId, linkIndex, e.target.value)
          }}
        />
      </Form.Group>
      <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          variant="primary"
          size="sm"
          onClick={function() { onSaveManual(tuneId, linkIndex) }}
        >
          Save link
        </Button>
        <YouTubeSearchModal
          tunebook={tunebook}
          setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
          onChange={function(ytLink) {
            onApplyYoutube(tuneId, linkIndex, ytLink)
          }}
          triggerElement={<>Search YouTube</>}
          value={(tuneName ? tuneName : '') + (composer ? ' ' + composer : '')}
        />
        <a
          target="_blank"
          rel="noreferrer"
          href={'https://www.youtube.com/results?search_query='
            + encodeURIComponent((tuneName || '') + ' ' + (composer || ''))}
        >
          <Button variant="outline-secondary" size="sm">
            {tunebook && tunebook.icons ? tunebook.icons.externallink : 'Open'} YouTube
          </Button>
        </a>
      </div>
    </div>
  )
}

function LinkRegionWarningRow({
  item,
  regionEdits,
  onRegionEdit,
  onSaveRegion,
  onDetectRegion,
  canAutoScan,
}) {
  const key = item.tuneId + ':' + item.linkIndex
  const startAt = Object.prototype.hasOwnProperty.call(regionEdits, key + ':startAt')
    ? regionEdits[key + ':startAt']
    : (item.link && item.link.startAt ? item.link.startAt : '')
  const endAt = Object.prototype.hasOwnProperty.call(regionEdits, key + ':endAt')
    ? regionEdits[key + ':endAt']
    : (item.link && item.link.endAt ? item.link.endAt : '')

  return (
    <div style={{ padding: '0.75em', borderTop: '1px solid #ddd', background: '#fffdf5' }}>
      <Alert variant="warning" style={{ padding: '0.35em 0.6em', marginBottom: '0.5em' }}>
        Missing playback region: {item.missing.join(', ')}
      </Alert>
      <div style={{ display: 'flex', gap: '0.75em', flexWrap: 'wrap' }}>
        <Form.Group>
          <Form.Label>Start at</Form.Label>
          <Form.Control
            type="text"
            value={startAt}
            placeholder="0:00"
            onChange={function(e) { onRegionEdit(item.tuneId, item.linkIndex, 'startAt', e.target.value) }}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>End at</Form.Label>
          <Form.Control
            type="text"
            value={endAt}
            placeholder="1:30"
            onChange={function(e) { onRegionEdit(item.tuneId, item.linkIndex, 'endAt', e.target.value) }}
          />
        </Form.Group>
      </div>
      <div style={{ display: 'flex', gap: '0.5em', marginTop: '0.5em', flexWrap: 'wrap' }}>
        <Button variant="primary" size="sm" onClick={function() { onSaveRegion(item.tuneId, item.linkIndex) }}>
          Save region
        </Button>
        {canAutoScan && (
          <Button variant="outline-secondary" size="sm" onClick={function() { onDetectRegion(item.tuneId, item.linkIndex) }}>
            Detect region
          </Button>
        )}
      </div>
    </div>
  )
}

export default function LinksCheckTab(props) {
  const groupedFailures = groupFailuresByTune(props.failures || [])
  const groupedWarnings = groupWarningsByTune(props.warnings || [])

  return (
    <div>
      <p style={{ marginBottom: '0.75em', color: '#555' }}>
        Verifies link playback and flags missing start/end times. Failed links can be replaced below;
        region warnings do not block a successful playback check.
      </p>

      {props.renderSummaryAlert && props.renderSummaryAlert()}

      {props.renderBackgroundScanProgress && props.renderBackgroundScanProgress()}

      {(props.phase === 'intro' || props.phase === 'done' || props.phase === 'cancelled')
        && props.renderTunesWithoutLinksSection
        && props.renderTunesWithoutLinksSection({
          showHeading: props.phase !== 'intro',
          switchId: props.phase === 'intro'
            ? 'bulk-check-links-show-missing'
            : 'bulk-check-links-show-missing-results',
        })}

      <SearchProgressBar
        visible={
          props.phase === 'running-links'
          || ((props.phase === 'done' || props.phase === 'cancelled') && !!props.progressMessage)
        }
        percent={props.phase === 'running-links' ? props.progressPercent : (props.phase === 'done' ? 100 : props.progressPercent)}
        message={props.progressMessage}
        defaultMessage="Preparing link check..."
      />

      {props.phase === 'done' && props.failures.length === 0 && props.checkedCount > 0 && (
        <Alert variant="success" style={{ marginTop: '0.75em' }}>
          All checked links played successfully.
        </Alert>
      )}

      {props.phase === 'cancelled' && (
        <Alert variant="warning" style={{ marginTop: '0.75em' }}>
          Link check was cancelled.
        </Alert>
      )}

      {groupedWarnings.length > 0 && (
        <div style={{ marginTop: '1em' }}>
          <h5>Missing playback regions</h5>
          {groupedWarnings.map(function(tuneGroup) {
            return (
              <div
                key={'warn-' + tuneGroup.tuneId}
                style={{
                  marginBottom: '1em',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ background: '#fff8e6', padding: '0.5em 0.75em', fontWeight: 'bold' }}>
                  {tuneGroup.tuneName}
                  {tuneGroup.composer ? ' — ' + tuneGroup.composer : ''}
                </div>
                {tuneGroup.warnings.map(function(item) {
                  return (
                    <LinkRegionWarningRow
                      key={item.tuneId + '-' + item.linkIndex}
                      item={item}
                      regionEdits={props.regionEdits}
                      onRegionEdit={props.onRegionEdit}
                      onSaveRegion={props.onSaveRegion}
                      onDetectRegion={props.onDetectRegion}
                      canAutoScan={props.canAutoScan}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {(props.phase === 'done' || props.phase === 'cancelled') && props.failures.length > 0 && (
        <div style={{ marginTop: '1em' }}>
          <h5>Failed links</h5>
          {groupedFailures.map(function(tuneGroup) {
            return (
              <div
                key={tuneGroup.tuneId}
                style={{
                  marginBottom: '1em',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ background: '#f5f5f5', padding: '0.5em 0.75em', fontWeight: 'bold' }}>
                  {tuneGroup.tuneName}
                  {tuneGroup.composer ? ' — ' + tuneGroup.composer : ''}
                </div>
                {tuneGroup.failures.map(function(item) {
                  return (
                    <LinkAllocationRow
                      key={item.tuneId + '-' + item.linkIndex}
                      tuneId={item.tuneId}
                      tuneName={tuneGroup.tuneName}
                      composer={tuneGroup.composer}
                      linkIndex={item.linkIndex}
                      link={item.link}
                      error={item.error}
                      backgroundColor="#fff5f5"
                      linkEdits={props.linkEdits}
                      onEditChange={props.onEditChange}
                      onSaveManual={props.onSaveManual}
                      onApplyYoutube={props.onApplyYoutube}
                      tunebook={props.tunebook}
                      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
