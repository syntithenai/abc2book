import { Alert } from 'react-bootstrap'

export default function GoogleUnverifiedAppAlert(props) {
  const permissionNote = props.permissionNote || 'Drive access is a sensitive permission.'
  return (
    <Alert variant="info" className="small mb-3">
      <strong>If Google shows &quot;Google hasn&apos;t verified this app&quot;</strong>
      <ol className="mb-0 ps-3 mt-2">
        <li>Click <strong>Advanced</strong></li>
        <li>Click <strong>Go to tunebook (unsafe)</strong> or <strong>Continue</strong></li>
      </ol>
      <div className="mt-2 text-muted">
        That warning appears because {permissionNote} For private use, add your Google account under
        {' '}<strong>Google Cloud Console → OAuth consent screen → Test users</strong>.
        Public use on tunebook.net requires submitting the app for Google verification.
      </div>
    </Alert>
  )
}
