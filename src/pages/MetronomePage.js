import MetronomePanel from '../components/MetronomePanel'
import { useDocumentTitle } from '../pageTitle'

export default function MetronomePage(props) {
  useDocumentTitle('Rhythm')
  return (
    <div style={{ width: '100%' }}>
      <h1>Rhythm</h1>
      <MetronomePanel
        tunebook={props.tunebook}
        currentTune={props.currentTune}
        tunes={props.tunes}
      />
    </div>
  )
}
