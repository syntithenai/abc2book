import { Button, Modal } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { CHORD_READINESS_RECOMMENDED_QUEUE } from '../tuneChordReadinessAudit'

export default function CleanupHelpModal(props) {
  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Chord readiness cleanup</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h3 className="h5">What this tab is for</h3>
        <p>
          This tool helps you improve how songs in your song book show chords and lyrics together.
          It scans tunes, reports quality issues, adds searchable tags, and can apply a small set of
          safe automatic fixes. It does not change how tunes display by itself — tagging and fixes
          prepare the data; you still edit individual tunes where needed.
        </p>

        <h3 className="h5">Typical workflow</h3>
        <ol>
          <li>
            <strong>Audit</strong> — Scan the book and get counts (ready, display ready, needs work,
            tags). Run this first so you know the size of the job. Results appear below the controls
            and in Background jobs → Chord cleanup.
          </li>
          <li>
            <strong>Tag only</strong> — Add chord-readiness tags such as <code>chords:structure-review</code>{' '}
            to tunes that need attention. Tags let you filter in{' '}
            <Link to="/tunes" onClick={props.onHide}>Tunes</Link> (use the tag links in the audit summary).
            Each click processes up to the batch size; the badge on the button shows how many tunes
            are still queued for tagging.
          </li>
          <li>
            <strong>Apply fixes</strong> — Run automatic repairs (ABC structure, section labels,
            scaffold merge where appropriate). Leave <strong>Dry run</strong> on to preview, then turn
            it off to save changes. Same batching and badge behaviour as Tag only.
          </li>
        </ol>

        <h3 className="h5">Recommended order to work through issues</h3>
        <p className="app-text-muted small">
          After an audit, tackle tags in this order (highest impact first):
        </p>
        <ol className="small">
          {CHORD_READINESS_RECOMMENDED_QUEUE.map(function(item) {
            return <li key={item}>{item}</li>
          })}
        </ol>
        <p className="app-text-muted small">
          Tunes tagged <code>chords:strain-mismatch</code> may still display acceptably; treat that
          tag as informational unless lyrics or structure look wrong.
        </p>

        <h3 className="h5">What the tags mean (in plain terms)</h3>
        <ul>
          <li>
            <code>chords:inline-only</code> — Chords already live in the lyric lines (chord rows or
            ChordPro like <code>[G]word</code>). The app shows those chords as written and does not
            overlay chords from ABC notation.
          </li>
          <li>
            <code>chords:structure-review</code> — Verse/chorus structure in lyrics does not line up
            with the ABC chart sections. Often fixed by adding <code># Section</code> or{' '}
            <code>[Section]</code> headers in lyrics and matching strain markers in ABC.
          </li>
          <li>
            <code>chords:anacrusis-review</code> — Pickup-bar barlines in ABC may need correction
            (e.g. double barline after a pickup). Apply fixes can collapse some of these automatically.
          </li>
          <li>
            <code>chords:sync-labels</code> — Section labels in the editor should be synced from ABC.
          </li>
          <li>
            <code>chords:grid-merge-candidate</code> — Scaffold-only tunes that may benefit from
            merging a chord grid into ABC (not used for inline-chord lyrics).
          </li>
          <li>
            <code>chords:melody-no-chords</code> — Melody exists but ABC has no chord symbols.
          </li>
          <li>
            <code>chords:needs-source</code> — Lyrics exist but there is no chord source to display.
          </li>
          <li>
            <code>chords:display-ready</code> — Lyrics+chords view can show harmony; remaining tags
            are minor hygiene only.
          </li>
          <li>
            <code>chords:ready</code> — Passes the stricter data-hygiene checklist (may differ from
            display ready).
          </li>
        </ul>

        <h3 className="h5">What Apply fixes — and what it does not</h3>
        <ul>
          <li>
            <strong>Does:</strong> Tier-A ABC structure repairs (repeat marks, anacrusis barlines,
            bar padding, etc.), sync section labels, and scaffold grid merge for timing-scaffold tunes
            without embedded lyric chords.
          </li>
          <li>
            <strong>Does not:</strong> Rewrite embedded chord lyrics, add <code># Section</code> headers
            for you, or fix every structural mismatch. Plain-lyrics tunes get chords from ABC at
            display time — you do not need Apply to “merge chords into lyrics” for those.
          </li>
        </ul>

        <h3 className="h5">Controls</h3>
        <ul>
          <li><strong>Book scope</strong> — Limit scan/tag/fix to one book or all tunes.</li>
          <li><strong>Batch size</strong> — Tunes processed per Tag or Apply click.</li>
          <li><strong>Dry run</strong> — Preview Tag/Apply without saving (recommended first).</li>
          <li><strong>Include melody fixes</strong> — Allow grid merge on tunes with real melody (use carefully).</li>
          <li><strong>Always re-tag after apply</strong> — Refresh tags on tunes you fix.</li>
          <li><strong>Cancel</strong> — Stops the current long-running job while progress is shown.</li>
        </ul>

        <p className="app-text-muted small mb-0">
          More detail on rendering rules: see <code>CHORD_RENDERING.md</code> in the project docs.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
