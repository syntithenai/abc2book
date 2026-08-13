import { useState } from 'react'
import { Button, ListGroup, Modal } from 'react-bootstrap'
import { getLinkSrcType } from '../checkTuneLinkPlayback'
import { resolveMediaLinkPlaybackButton, mediaLinkPlaybackIcon } from '../mediaLinkPlaybackButton'
import LinksEditor from './LinksEditor'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

function formatLinkDetail(link) {
  if (!link) return ''
  if (link.title && String(link.title).trim()) return String(link.title).trim()
  if (link.link && String(link.link).trim()) {
    const url = String(link.link).trim()
    return url.length > 72 ? url.slice(0, 69) + '…' : url
  }
  return 'Untitled link'
}

function startLinkPlayback(tune, tunebook, mediaController, linkKey) {
  if (!tune || !mediaController) return
  if (mediaController.setTapToPlay) mediaController.setTapToPlay(false)
  if (mediaController.setPlayCancelled) mediaController.setPlayCancelled(false)
  if (mediaController.setTune) mediaController.setTune(tune)
  const sameSource = mediaController.isMediaPlaybackRoute
    && mediaController.isMediaPlaybackRoute()
    && mediaController.mediaLinkNumber === linkKey
  if (mediaController.applyPlaybackRoute) {
    mediaController.applyPlaybackRoute('playMedia', String(linkKey), tune, tunebook)
  }
  const requested = mediaController.requestPlayback && mediaController.requestPlayback({
    tuneId: tune.id,
    playState: 'playMedia',
    linkNum: linkKey,
    fromUserGesture: true,
    fresh: !sameSource,
  })
  if (!requested) {
    if (mediaController.playFromUserGesture) {
      mediaController.playFromUserGesture(sameSource ? {} : { fresh: true })
    } else if (mediaController.play) {
      mediaController.play(sameSource ? {} : { fresh: true })
    }
  }
}

export default function SelectMediaLinkModal(props) {
  const {
    show,
    onHide,
    tune,
    tunebook,
    mediaController,
    currentLinkIndex,
    forceRefresh,
    token,
    user,
    googleDocumentId,
    login,
  } = props

  const responsiveModalProps = useResponsiveModalProps()
  const [showEditor, setShowEditor] = useState(false)
  const [editorLinks, setEditorLinks] = useState('[]')

  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink
  const links = tune && Array.isArray(tune.links) ? tune.links : []
  const playableLinks = links.map(function(link, index) {
    if (!link || !link.link || !String(link.link).trim()) return null
    const srcType = getLinkSrcType(link, isYoutubeLink)
    if (srcType === 'empty') return null
    return { link: link, index: index, srcType: srcType }
  }).filter(Boolean)

  function handleClose() {
    setShowEditor(false)
    if (onHide) onHide()
  }

  function openEditor() {
    const snapshot = tune
      ? Object.assign({}, tune, {
        links: Array.isArray(tune.links) ? tune.links.map(function(link) { return Object.assign({}, link) }) : [],
      })
      : null
    setEditorLinks(JSON.stringify(snapshot && Array.isArray(snapshot.links) ? snapshot.links : []))
    setShowEditor(true)
  }

  function handleEditorClose() {
    setShowEditor(false)
    try {
      const nextLinks = JSON.parse(editorLinks)
      if (tune && tune.id && props.onLinksSaved) {
        props.onLinksSaved(nextLinks, tune.id)
      }
    } catch (e) {}
  }

  function handleSelect(linkKey) {
    startLinkPlayback(tune, tunebook, mediaController, linkKey)
    handleClose()
  }

  return (
    <>
      <Modal
        show={show && !showEditor}
        onHide={handleClose}
        centered
        data-testid="select-media-link-modal"
        {...responsiveModalProps}
      >
        <Modal.Header closeButton>
          <Modal.Title>Select media{tune && tune.name ? ' — ' + tune.name : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {playableLinks.length === 0 ? (
            <p className="mb-3">This tune has no playable media links yet.</p>
          ) : (
            <ListGroup className="mb-3">
              {playableLinks.map(function(entry) {
                const buttonProps = resolveMediaLinkPlaybackButton(entry.link, isYoutubeLink)
                const isCurrent = currentLinkIndex != null && entry.index === currentLinkIndex
                return (
                  <ListGroup.Item key={entry.index}>
                    <div className="d-flex justify-content-between align-items-center gap-3">
                      <div>
                        <div className="fw-semibold">
                          {mediaLinkPlaybackIcon(tunebook, buttonProps.iconKey)}
                          {' '}
                          Link {entry.index + 1}
                          {isCurrent ? ' (current)' : ''}
                        </div>
                        <div className="small text-muted text-break">{formatLinkDetail(entry.link)}</div>
                      </div>
                      <Button variant="primary" onClick={function() { handleSelect(entry.index) }}>
                        Play
                      </Button>
                    </div>
                  </ListGroup.Item>
                )
              })}
            </ListGroup>
          )}
          <Button variant="outline-secondary" onClick={openEditor}>
            Manage media links…
          </Button>
        </Modal.Body>
      </Modal>

      <Modal
        show={showEditor}
        onHide={handleEditorClose}
        size="xl"
        dialogClassName="links-editor-modal-dialog"
        {...responsiveModalProps}
      >
        <Modal.Header closeButton>
          <Modal.Title>Media{tune && tune.name ? ' — ' + tune.name : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <LinksEditor
            isOpen={showEditor}
            mediaController={mediaController}
            onChange={function(nextLinks) {
              setEditorLinks(JSON.stringify(nextLinks))
            }}
            tunebook={tunebook}
            links={JSON.parse(editorLinks)}
            tune={tune}
            tuneId={tune && tune.id}
            handleClose={handleEditorClose}
            token={token}
            user={user}
            googleDocumentId={googleDocumentId}
            forceRefresh={forceRefresh}
            login={login}
          />
        </Modal.Body>
      </Modal>
    </>
  )
}
