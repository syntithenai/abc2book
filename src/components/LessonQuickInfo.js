import { OverlayTrigger, Popover, Button } from 'react-bootstrap'

export function entityExternalLabel(entity) {
  if (!entity || !entity.type) return 'Learn more'
  if (entity.type === 'organization') return 'Visit website'
  return 'Learn more'
}

export function LessonQuickInfoPopover(props) {
  const entity = props.entity
  const recordingLabel = props.recordingLabel
  const tunebook = props.tunebook
  const canPlay = !!props.canPlay
  const onPlay = props.onPlay
  const popoverId = props.popoverId || 'lesson-info'

  if (!entity) return null

  return (
    <Popover id={popoverId} className="lesson-quick-info-popover">
      <Popover.Header as="h3">{entity.name}</Popover.Header>
      <Popover.Body>
        {recordingLabel ? (
          <p className="lesson-quick-info-recording">
            <em>{recordingLabel}</em>
          </p>
        ) : null}
        {entity.image ? (
          <img
            className="lesson-entity-popover-image"
            src={entity.image}
            alt=""
            loading="lazy"
            width="160"
          />
        ) : null}
        {entity.years ? <p className="lesson-entity-years">{entity.years}</p> : null}
        {entity.region ? <p className="lesson-entity-region">{entity.region}</p> : null}
        {entity.form ? <p className="lesson-entity-form">{entity.form}</p> : null}
        {entity.summary ? <p className="lesson-entity-summary">{entity.summary}</p> : null}
        {entity.blurb ? <p>{entity.blurb}</p> : null}
        {entity.about ? <p>{entity.about}</p> : null}
        {entity.reference ? <p className="text-muted small">{entity.reference}</p> : null}
        <div className="lesson-entity-popover-footer d-flex gap-2 mt-2">
          {entity.url ? (
            <Button
              variant="outline-secondary"
              size="sm"
              href={entity.url}
              target="_blank"
              rel="noreferrer"
            >
              {entityExternalLabel(entity)}
            </Button>
          ) : null}
          {canPlay && onPlay ? (
            <Button
              variant="link"
              size="sm"
              className="lesson-inline-play p-0"
              aria-label={'Play ' + (recordingLabel || entity.name)}
              onClick={onPlay}
            >
              {tunebook.icons.play} Play
            </Button>
          ) : null}
        </div>
      </Popover.Body>
    </Popover>
  )
}

export function LessonQuickInfoTrigger(props) {
  const trigger = props.trigger
  const overlay = props.overlay
  return (
    <OverlayTrigger
      trigger={['hover', 'focus', 'click']}
      delay={{ show: 200, hide: 150 }}
      placement="auto"
      overlay={overlay}
      rootClose
    >
      {trigger}
    </OverlayTrigger>
  )
}
