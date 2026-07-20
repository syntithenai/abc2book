import { Tabs, Tab, Modal, Button, ListGroup, Container, Col, Row } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router-dom'
import { handleImportNavigation } from '../shareImportNavigation'
import { runPendingShareImportSideEffect } from '../shareImportSession'

function bucketCount(bucket) {
  if (!bucket) return 0
  if (Array.isArray(bucket)) return bucket.length
  return Object.keys(bucket).length
}

function bucketValues(bucket) {
  if (!bucket) return []
  if (Array.isArray(bucket)) return bucket
  return Object.values(bucket)
}

function tuneTitle(tune) {
  return (tune && (tune.name || tune.title)) || '(untitled)'
}

function contentSummary(status) {
  if (!status) return ''
  var parts = []
  if (status.hasNotes) parts.push('notation')
  if (status.hasChords) parts.push('chords')
  if (status.hasLyrics) parts.push('lyrics')
  return parts.length ? parts.join(' · ') : 'metadata only'
}

var BUCKET_META = {
  inserts: {
    tabTitle: 'New tunes',
    countLabel: function(n) { return n + ' new tune' + (n === 1 ? '' : 's') + ' will be added to your library.' },
    intro: 'These tunes are not in your library yet. Import will add them.',
    rowAction: 'Will be added as a new tune',
  },
  updates: {
    tabTitle: 'Updated',
    countLabel: function(n) { return n + ' tune' + (n === 1 ? '' : 's') + ' will be updated from the import (import is newer).' },
    intro: 'The imported copy is newer than yours. Import will replace your local copy.',
    rowAction: 'Import is newer — will update your copy',
  },
  localUpdates: {
    tabTitle: 'Local changes kept',
    countLabel: function(n) { return n + ' locally changed tune' + (n === 1 ? '' : 's') + ' will keep your version (skipped by Import).' },
    intro: 'Your local copy is newer than the import. Import keeps your changes. Choose Discard Local Changes to overwrite with the imported version.',
    rowAction: 'Your copy is newer — kept as-is unless you discard local changes',
  },
  skippedUpdates: {
    tabTitle: 'Up to date',
    countLabel: function(n) { return n + ' tune' + (n === 1 ? '' : 's') + ' already match the import (no change).' },
    intro: 'These tunes already match the import by id and timestamp. Nothing will change.',
    rowAction: 'Already up to date — no change',
  },
  deletes: {
    tabTitle: 'Deleted',
    countLabel: function(n) { return n + ' tune' + (n === 1 ? '' : 's') + ' will be removed (deleted in the import).' },
    intro: 'These tunes were deleted in the imported file and will be removed from your library.',
    rowAction: 'Will be removed from your library',
  },
  duplicates: {
    tabTitle: 'Duplicates',
    countLabel: function(n) { return n + ' duplicate tune' + (n === 1 ? '' : 's') + ' will be skipped (same content already exists; any new books will be merged onto the existing tune).' },
    intro: 'Same musical content already exists under another id. Skipped as new tunes unless you choose Import With Duplicates. Missing books from the import are still merged onto the existing tune.',
    rowAction: 'Duplicate content — books merge onto existing; skipped as new tune unless you force duplicates',
  },
}

var BUCKET_ORDER = ['inserts', 'updates', 'localUpdates', 'skippedUpdates', 'deletes', 'duplicates']

function ImportTuneRow(props) {
  var tune = props.tune
  var status = props.status
  var action = props.action
  var icons = props.icons
  return (
    <ListGroup.Item className={props.index % 2 === 0 ? 'even' : 'odd'}>
      <Container fluid className="px-0">
        <Row className="align-items-start g-2">
          <Col xs="auto" className="pt-1">
            <span>{(status && status.hasNotes) ? <Button size="sm" variant="outline-primary" disabled tabIndex={-1} title="Has notation">{icons.music}</Button> : null}</span>
            <span>{(status && status.hasChords) ? <Button size="sm" variant="outline-primary" disabled tabIndex={-1} title="Has chords">{icons.guitar}</Button> : null}</span>
            <span>{(status && status.hasLyrics) ? <Button size="sm" variant="outline-primary" disabled tabIndex={-1} title="Has lyrics">{icons.words}</Button> : null}</span>
          </Col>
          <Col>
            <div style={{ fontWeight: 600 }}>{tuneTitle(tune)}</div>
            <div className="text-muted small">{action}</div>
            {contentSummary(status) ? (
              <div className="text-muted small">Includes: {contentSummary(status)}</div>
            ) : null}
          </Col>
        </Row>
      </Container>
    </ListGroup.Item>
  )
}

/** True when Import’s default path changes nothing the user must decide: only keep-local and/or already-match. */
export function isImportNotificationOnly(counts) {
  if (!counts) return false
  return (
    counts.inserts === 0
    && counts.updates === 0
    && counts.deletes === 0
    && counts.duplicates === 0
    && (counts.localUpdates > 0 || counts.skippedUpdates > 0)
  )
}

export default function ImportWarningDialog(props) {
  var navigate = useNavigate()
  var results = props.importResults || {}
  var nav = props.navigateAfterImport || {}
  var curatedTitle = nav.curatedTitle || null
  var importKind = nav.importKind || (curatedTitle ? 'curated' : 'shared')

  var counts = {
    inserts: bucketCount(results.inserts),
    updates: bucketCount(results.updates),
    localUpdates: bucketCount(results.localUpdates),
    skippedUpdates: bucketCount(results.skippedUpdates),
    deletes: bucketCount(results.deletes),
    duplicates: bucketCount(results.duplicates),
  }

  var notificationOnly = isImportNotificationOnly(counts)
  var dialogTitle = notificationOnly
    ? (curatedTitle
      ? ('Already up to date: ' + curatedTitle)
      : 'Already up to date')
    : (curatedTitle
      ? ('Review curated book import: ' + curatedTitle)
      : (importKind === 'shared' ? 'Review shared tune book import' : 'Review import'))

  var defaultTab = BUCKET_ORDER.find(function(key) { return counts[key] > 0 }) || 'localUpdates'

  function handleClose() {
    props.closeWarning()
  }

  function handleNavigation(tunes) {
    props.setImportResults(null)
    var params = {}
    try {
      params = props.navigateAfterImport
    } catch (e) {
      params = {}
    }

    runPendingShareImportSideEffect().finally(function() {
      handleImportNavigation(params, {
        navigate: navigate,
        tunebook: props.tunebook,
        tunes: tunes,
        setCurrentTuneBook: props.setCurrentTuneBook,
        setTagFilter: props.setTagFilter,
        setFilter: props.setFilter,
      }, !!(params && params.autoplay))
    })
  }

  function confirmDefaultImport() {
    props.tunebook.applyImport().then(handleNavigation)
  }

  var canImport = counts.skippedUpdates > 0 || counts.localUpdates > 0 || counts.inserts > 0 || counts.updates > 0 || counts.deletes > 0

  return (
    <Modal
      show
      onHide={handleClose}
      backdrop="static"
      keyboard={false}
      size={notificationOnly ? 'lg' : 'xl'}
      dialogClassName="import-warning-dialog"
      data-testid="import-warning-dialog"
      data-notification-only={notificationOnly ? 'true' : 'false'}
    >
      <Modal.Header>
        <Modal.Title>{dialogTitle}</Modal.Title>
      </Modal.Header>
      {!props.importResults && (
        <Modal.Body><h1>Import Failed</h1></Modal.Body>
      )}
      {props.importResults && (
        <Modal.Body>
          <p className="mb-2">
            {notificationOnly
              ? (curatedTitle
                ? ('“' + curatedTitle + '” is already in your library. Nothing will be merged.')
                : 'This import is already in your library. Nothing will be merged.')
              : (curatedTitle
                ? ('Comparing the curated book “' + curatedTitle + '” with your library. Review what will be merged before continuing.')
                : 'Comparing the import with your library. Review what will be merged before continuing.')}
          </p>
          <div className="mb-2">
            {counts.updates ? <div>{BUCKET_META.updates.countLabel(counts.updates)}</div> : null}
            {counts.inserts ? <div>{BUCKET_META.inserts.countLabel(counts.inserts)}</div> : null}
            {counts.localUpdates ? <div>{BUCKET_META.localUpdates.countLabel(counts.localUpdates)}</div> : null}
            {counts.skippedUpdates ? <div>{BUCKET_META.skippedUpdates.countLabel(counts.skippedUpdates)}</div> : null}
            {counts.deletes ? <div>{BUCKET_META.deletes.countLabel(counts.deletes)}</div> : null}
            {counts.duplicates ? <div>{BUCKET_META.duplicates.countLabel(counts.duplicates)}</div> : null}
          </div>

          <div style={{ marginTop: '1em', marginBottom: '1em' }}>
            {notificationOnly ? (
              <>
                <Button
                  variant="success"
                  data-testid="import-warning-confirm"
                  onClick={confirmDefaultImport}
                >
                  OK
                </Button>
                {counts.localUpdates > 0 ? (
                  <>
                    {' '}
                    <Button
                      variant="outline-warning"
                      data-testid="import-warning-discard-local"
                      onClick={function() { props.tunebook.applyImport(false, true).then(handleNavigation) }}
                    >
                      Discard Local Changes
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {canImport ? (
                  <Button
                    variant="success"
                    data-testid="import-warning-confirm"
                    onClick={confirmDefaultImport}
                  >
                    Import
                  </Button>
                ) : null}
                {' '}
                {counts.duplicates > 0 ? (
                  <Button variant="warning" onClick={function() { props.tunebook.applyImport(true).then(handleNavigation) }}>
                    Import With Duplicates
                  </Button>
                ) : null}
                {' '}
                {counts.localUpdates > 0 ? (
                  <Button
                    variant="warning"
                    data-testid="import-warning-discard-local"
                    onClick={function() { props.tunebook.applyImport(false, true).then(handleNavigation) }}
                  >
                    Discard Local Changes
                  </Button>
                ) : null}
                {' '}
                {(counts.localUpdates > 0 && counts.duplicates > 0) ? (
                  <Button variant="warning" onClick={function() { props.tunebook.applyImport(true, true).then(handleNavigation) }}>
                    Import Duplicates and Discard Local Changes
                  </Button>
                ) : null}
                {' '}
                <Link to="/tunes">
                  <Button
                    variant="danger"
                    onClick={function() {
                      props.setImportResults(null)
                      props.closeWarning()
                    }}
                  >
                    Cancel
                  </Button>
                </Link>
              </>
            )}
          </div>

          <Tabs defaultActiveKey={defaultTab} id="import-warning-tabs">
            {BUCKET_ORDER.map(function(bucketKey) {
              var meta = BUCKET_META[bucketKey]
              var values = bucketValues(results[bucketKey])
              if (!meta || values.length === 0) return null
              var statuses = (results.tuneStatus && results.tuneStatus[bucketKey]) || []
              return (
                <Tab key={bucketKey} eventKey={bucketKey} title={meta.tabTitle + ' (' + values.length + ')'}>
                  <p className="small text-muted mt-2 mb-2">{meta.intro}</p>
                  <ListGroup>
                    {values.map(function(tune, index) {
                      return (
                        <ImportTuneRow
                          key={(tune && tune.id) || index}
                          index={index}
                          tune={tune}
                          status={statuses[index]}
                          action={meta.rowAction}
                          icons={props.tunebook.icons}
                        />
                      )
                    })}
                  </ListGroup>
                </Tab>
              )
            })}
          </Tabs>
        </Modal.Body>
      )}
    </Modal>
  )
}
