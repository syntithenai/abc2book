import JobQueueTabPanel from './JobQueueTabPanel'
import StemSeparationTabPanel from './StemSeparationTabPanel'

export default function StemCreateTabPanel({
  mediaController,
  queueProps,
}) {
  return (
    <>
      <JobQueueTabPanel {...queueProps} />
      <div className="background-jobs-stem-live-section">
        <h3 className="background-jobs-stem-live-heading">Live separation (current track)</h3>
        <StemSeparationTabPanel mediaController={mediaController} />
      </div>
    </>
  )
}
