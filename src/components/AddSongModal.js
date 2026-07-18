import { useEffect, useCallback } from 'react'
import { Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import {
  requestImportReview,
  showImportReviewUi,
} from '../importReviewSessionStore'

const DEFAULT_BOOK = 'songs'

function AddSongModal(props) {
  const navigate = useNavigate()

  const defaultTab = props.defaultTab === 'bulk' ? 'bulk' : 'add'

  const openBlankOrResumeAdd = useCallback(function(panelMode) {
    // Transient Add drafts: resume when present; otherwise open a blank draft.
    requestImportReview([], {
      entryMode: 'add',
      book: props.currentTuneBook || DEFAULT_BOOK,
      tags: Array.isArray(props.tagFilter) ? props.tagFilter : [],
      addPanelMode: panelMode === 'bulk' ? 'bulk' : (panelMode === 'curated' ? 'curated' : 'form'),
    })
    showImportReviewUi()
  }, [props.currentTuneBook, props.tagFilter])

  useEffect(function() {
    if (!props.routeMode) return undefined
    openBlankOrResumeAdd(defaultTab === 'bulk' ? 'bulk' : 'form')
    return undefined
  }, [props.routeMode, defaultTab, openBlankOrResumeAdd])

  function handleShow() {
    navigate('/add')
  }

  return (
    <>
      {!props.routeMode ? (
        props.buttonGroupMember ? (
          <span className="header-dropdown-add-trigger" style={{ display: 'contents' }}>
            <Button
              variant="success"
              size={props.buttonSize}
              className={(props.buttonClassName || '') + ' header-dropdown-add-btn'}
              title="Add Tunes"
              onClick={handleShow}
            >
              {props.tunebook.icons.fileadd} Add
            </Button>
          </span>
        ) : (
          <Button
            variant="success"
            size={props.buttonSize}
            className={props.buttonClassName}
            title="Add Tunes"
            onClick={handleShow}
          >
            {props.tunebook.icons.fileadd} Add
          </Button>
        )
      ) : null}
    </>
  )
}

export default AddSongModal
