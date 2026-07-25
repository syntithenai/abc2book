import { Modal, ListGroup } from 'react-bootstrap'
import LessonEntityRef from './LessonEntityRef'

function entitySummary(entity) {
  if (!entity) return ''
  if (entity.summary) return entity.summary
  const blurb = entity.blurb || ''
  if (blurb.length <= 120) return blurb
  return blurb.slice(0, 117) + '...'
}

function dialogEntities(lesson) {
  const entities = Array.isArray(lesson.entities) ? lesson.entities : []
  const order = Array.isArray(lesson.entity_order) ? lesson.entity_order : []
  const byId = {}
  entities.forEach(function(e) { if (e && e.id) byId[e.id] = e })
  const out = []
  order.forEach(function(id) {
    const ent = byId[id]
    if (ent && ['artist', 'band', 'organization'].indexOf(ent.type) !== -1) {
      out.push(ent)
      delete byId[id]
    }
  })
  entities.forEach(function(ent) {
    if (ent && byId[ent.id] && ['artist', 'band', 'organization'].indexOf(ent.type) !== -1) {
      out.push(ent)
    }
  })
  return out
}

export default function LessonEntitiesModal(props) {
  const lesson = props.lesson
  const items = lesson ? dialogEntities(lesson) : []

  function scrollToEntity(entityId) {
    if (!entityId || typeof document === 'undefined') return
    const el = document.querySelector('[data-entity-id="' + entityId + '"]')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('lesson-entity-highlight')
    window.setTimeout(function() {
      el.classList.remove('lesson-entity-highlight')
    }, 1500)
  }

  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Entities</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ListGroup variant="flush">
          {items.map(function(entity) {
            return (
              <ListGroup.Item key={entity.id} className="lesson-entities-row">
                <button
                  type="button"
                  className="btn btn-link p-0 lesson-entities-name"
                  onClick={function() { scrollToEntity(entity.id) }}
                >
                  {entity.name}
                </button>
                <span className="lesson-entities-summary text-muted">{entitySummary(entity)}</span>
                <span className="lesson-entities-actions">
                  <LessonEntityRef
                    entity={entity}
                    lesson={lesson}
                    tunebook={props.tunebook}
                    navigate={props.navigate}
                    mediaController={props.mediaController}
                  />
                </span>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      </Modal.Body>
    </Modal>
  )
}
