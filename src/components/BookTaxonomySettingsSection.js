import { useState } from 'react'
import { Alert, Button, Form, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { PUBLISHABLE_BOOKS, scrapeFileForBook } from '../bookTaxonomy.js'
import { rebuildIndexesFromTunes } from '../tuneIndexRebuilder'
import { rebuildTextSearchIndexFromTunes } from '../tuneTextSearchIndex'
import { yieldToMain } from '../tuneListFilter'
import { fetchViaMediaProxy } from '../mediaProxyClient'
import { isMusicGenerationAdmin } from '../musicGenerationAdmin'
import {
  applyMembershipMigration,
  inventoryFromTunes,
  auditInventories,
} from '../bookTaxonomyMigrate.js'

async function paintBusyFrame() {
  // Let React commit spinner/disabled state before heavy sync work.
  await yieldToMain()
  await new Promise(function(resolve) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function() { requestAnimationFrame(resolve) })
    } else {
      setTimeout(resolve, 16)
    }
  })
}

function membershipUnchanged(before, after) {
  if (!before || !after) return true
  return JSON.stringify(before.books || []) === JSON.stringify(after.books || [])
    && JSON.stringify(before.tags || []) === JSON.stringify(after.tags || [])
    && JSON.stringify(before.bookPages || {}) === JSON.stringify(after.bookPages || {})
}

async function publishBookToGithub(accessToken, book, abc, message) {
  const response = await fetchViaMediaProxy('/admin/github/publish-book', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      book: book,
      filename: scrapeFileForBook(book),
      abc: abc,
      message: message || ('Publish ' + book + ' from tunebook'),
    }),
  })
  const body = await response.json().catch(function() { return {} })
  if (!response.ok) {
    const detail = body && (body.detail || body.error)
    throw new Error(typeof detail === 'string' ? detail : ('Publish failed (' + response.status + ')'))
  }
  return body
}

export default function BookTaxonomySettingsSection(props) {
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const indexes = props.indexes
  const token = props.token
  const user = props.user
  const isAdmin = isMusicGenerationAdmin(user)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [publishBook, setPublishBook] = useState(PUBLISHABLE_BOOKS[0] || 'tunes')
  const [commitMessage, setCommitMessage] = useState('')

  if (!isAdmin) return null

  async function handleMigrateCollection() {
    setBusy(true)
    setError('')
    setMessage('')
    setProgress('Preparing migration…')
    await paintBusyFrame()

    try {
      const ids = Object.keys(tunes)
      const preTunes = {}
      const next = {}
      const report = {
        tuneCount: 0,
        changed: 0,
        demotedLabels: {},
        renamedLabels: {},
      }
      const changedIds = []

      setProgress('Migrating membership… 0 / ' + ids.length)
      await paintBusyFrame()

      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i]
        const tune = tunes[id]
        if (!tune) continue
        report.tuneCount += 1
        preTunes[id] = {
          id: id,
          name: tune.name,
          books: tune.books,
          tags: tune.tags,
          bookPages: tune.bookPages,
        }
        const after = applyMembershipMigration(tune)
        next[id] = after
        if (!membershipUnchanged(tune, after)) {
          report.changed += 1
          changedIds.push(id)
        }
        if (i > 0 && i % 40 === 0) {
          setProgress('Migrating membership… ' + i + ' / ' + ids.length)
          await yieldToMain()
        }
      }

      setProgress('Auditing…')
      await yieldToMain()
      const audit = auditInventories(inventoryFromTunes(preTunes), inventoryFromTunes(next))
      if (!audit.ok) {
        const detail = audit.notes.join('; ') || 'see console'
        setError('Audit failed: ' + detail)
        toast.error('Book taxonomy audit failed')
        console.warn('book taxonomy audit', audit)
        return
      }

      setProgress('Saving ' + changedIds.length + ' updated tunes…')
      await yieldToMain()
      if (tunebook && tunebook.beginTunesBatchCommit) tunebook.beginTunesBatchCommit()
      for (let j = 0; j < changedIds.length; j += 1) {
        const id = changedIds[j]
        if (tunebook && tunebook.saveTune) {
          tunebook.saveTune(next[id], false, {
            deferCommit: true,
            skipHistory: true,
            historyLabel: 'Book taxonomy migrate',
          })
        }
        if (j > 0 && j % 15 === 0) {
          setProgress('Saving… ' + j + ' / ' + changedIds.length)
          await yieldToMain()
        }
      }
      if (tunebook && tunebook.commitTunesBatch) {
        await Promise.resolve(tunebook.commitTunesBatch())
      }

      setProgress('Rebuilding indexes…')
      await yieldToMain()
      await rebuildIndexesFromTunes(next, {
        yieldToMain: yieldToMain,
        onProgress: function(done, total) {
          setProgress('Rebuilding indexes… ' + done + ' / ' + total)
        },
      })
      if (indexes && indexes.reloadFromStore) await indexes.reloadFromStore()
      await rebuildTextSearchIndexFromTunes(next)
      if (props.forceRefresh) props.forceRefresh()

      const doneMsg = 'Migration complete. Changed ' + report.changed + ' of ' + report.tuneCount + ' tunes.'
      setMessage(doneMsg)
      toast.success(doneMsg)
    } catch (e) {
      console.error(e)
      const errMsg = e && e.message ? e.message : 'Migration failed'
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setProgress('')
      setBusy(false)
    }
  }

  async function handlePruneTags() {
    setBusy(true)
    setError('')
    setMessage('')
    setProgress('Pruning unused tags…')
    await paintBusyFrame()
    try {
      if (!indexes || !indexes.pruneEmptyTagsFromIndex) {
        throw new Error('Tag prune is not available')
      }
      const result = indexes.pruneEmptyTagsFromIndex()
      const doneMsg = 'Pruned ' + result.removed.length + ' empty tag'
        + (result.removed.length === 1 ? '' : 's')
        + '; ' + result.kept + ' remain.'
      setMessage(doneMsg)
      toast.success(doneMsg)
      if (props.forceRefresh) props.forceRefresh()
    } catch (e) {
      const errMsg = e && e.message ? e.message : 'Prune failed'
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setProgress('')
      setBusy(false)
    }
  }

  async function handlePublish() {
    setBusy(true)
    setError('')
    setMessage('')
    setProgress('Publishing ' + publishBook + '…')
    await paintBusyFrame()
    try {
      if (!token) throw new Error('Sign in required to publish')
      if (!tunebook || !tunebook.toAbc) throw new Error('Tunebook export unavailable')
      const abc = tunebook.toAbc(publishBook)
      if (!abc || !String(abc).trim()) throw new Error('No ABC for book: ' + publishBook)
      const result = await publishBookToGithub(token, publishBook, abc, commitMessage)
      const doneMsg = 'Published ' + publishBook
        + (result.commitUrl ? (' — ' + result.commitUrl) : (result.sha ? (' @ ' + result.sha) : ''))
      setMessage(doneMsg)
      toast.success('Published ' + publishBook)
    } catch (e) {
      const errMsg = e && e.message ? e.message : 'Publish failed'
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setProgress('')
      setBusy(false)
    }
  }

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>Books taxonomy</h2>
      <p>
        Align collection books/tags with the consolidated taxonomy, prune empty tag index
        keys, and publish a book ABC to GitHub <code>scrape/</code> (admin).
      </p>
      {busy && progress ? (
        <Alert variant="info" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" />
          <span>{progress}</span>
        </Alert>
      ) : null}
      {!busy && message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', marginBottom: '1em' }}>
        <Button variant="primary" disabled={busy} onClick={handleMigrateCollection}>
          {busy ? <Spinner animation="border" size="sm" className="me-1" /> : null}
          Migrate collection books/tags
        </Button>
        <Button variant="outline-secondary" disabled={busy} onClick={handlePruneTags}>
          {busy ? <Spinner animation="border" size="sm" className="me-1" /> : null}
          Prune unused tags
        </Button>
      </div>
      <h3>Publish book to GitHub</h3>
      <Form.Group className="mb-2">
        <Form.Label>Book</Form.Label>
        <Form.Select
          value={publishBook}
          disabled={busy}
          onChange={function(e) { setPublishBook(e.target.value) }}
        >
          {PUBLISHABLE_BOOKS.map(function(book) {
            return <option key={book} value={book}>{book}</option>
          })}
        </Form.Select>
      </Form.Group>
      <Form.Group className="mb-2">
        <Form.Label>Commit message (optional)</Form.Label>
        <Form.Control
          value={commitMessage}
          disabled={busy}
          onChange={function(e) { setCommitMessage(e.target.value) }}
          placeholder={'Publish ' + publishBook + ' from tunebook'}
        />
      </Form.Group>
      <Button variant="success" disabled={busy || !token} onClick={handlePublish}>
        {busy ? <Spinner animation="border" size="sm" className="me-1" /> : null}
        Publish to GitHub
      </Button>
    </div>
  )
}
