import { Button, Modal } from 'react-bootstrap'

export default function CollectionCuratorHelpModal(props) {
  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>How to use the collection curator</Modal.Title>
      </Modal.Header>
      <Modal.Body className="collection-curator-help-body">
        <h5>What this is</h5>
        <p>
          The curator is a listening and decision tool for your personal music library on the resolver.
          Tunebook already indexes your files for search; this page helps you <strong>decide what to keep</strong>,
          <strong> spot duplicates</strong>, and <strong>plan moves</strong> into a tidy layout — without deleting anything.
        </p>
        <p>
          Your music stays on disk in folders like <code>incoming/</code>, <code>clementine/</code>, and <code>music/</code> today.
          The goal is to copy keepers into a canonical tree:
        </p>
        <pre className="small bg-light p-2 rounded">library/&#123;genre&#125;/&#123;Artist&#125;/&#123;Title&#125;.mp3</pre>
        <p className="small text-muted mb-4">
          One file per song per artist. Album name lives in tags, not in folder names.
          Special collections (e.g. <code>slipperyhill</code>) are preserved and never moved automatically.
        </p>

        <h5>How decisions work</h5>
        <p>
          <strong>Track tab:</strong> each Keep / Review later / Cull click affects <em>only that one file</em>.
          It does not auto-apply to similar songs or the whole artist.
        </p>
        <p>
          <strong>By folder</strong> and <strong>By artist</strong> tabs: bulk buttons apply to <em>all tracks</em>
          in that folder chunk or under that artist name in the current phase.
        </p>
        <ul>
          <li><strong>Keep</strong> — include in <code>library/</code> move plans</li>
          <li><strong>Review later</strong> — saved for later; does <em>not</em> schedule moves (defer pile)</li>
          <li><strong>Cull</strong> — low priority; excluded from library moves</li>
        </ul>

        <h5>Recommended workflow (no need to listen to thousands of tracks)</h5>
        <ol>
          <li><strong>Overview</strong> — check tag coverage; use quick actions if helpful</li>
          <li><strong>By folder</strong> — Keep whole shelves you trust (e.g. <code>WORLDOFMUSIC</code>); Review later on <code>incoming/</code> buckets</li>
          <li><strong>By artist</strong> — Keep artists you know; Cull artists you do not care about; expand a row only to spot-check</li>
          <li><strong>Tracks</strong> — search and listen only for unset edge cases</li>
          <li><strong>Duplicates</strong> — separate tab; confirm keepers and plan quarantine (often no listening needed)</li>
          <li><strong>Plan library moves</strong> on Overview when Keep count looks right (dry-run first)</li>
        </ol>

        <h5>Play buttons</h5>
        <p>
          Audio loads only when you click <strong>Play</strong> (one track at a time). This avoids choking the browser
          when hundreds of rows are listed.
        </p>

        <h5>Applying moves</h5>
        <p className="mb-0">
          Move plans are dry-runs saved on the resolver. Apply on the host where <code>Music/</code> is writable
          (<code>local-resolver/CURATION.md</code>). Rebuild the index in Settings after moves. Nothing is deleted —
          extras go to <code>_quarantine/</code>.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
