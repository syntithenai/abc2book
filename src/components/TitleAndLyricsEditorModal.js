import {useState, useEffect} from 'react'
import {Button, Modal, Form} from 'react-bootstrap'
import useMusicBrainz from '../useMusicBrainz'
import useAbcjsParser from '../useAbcjsParser'
import {useParams} from 'react-router-dom'
import AsyncCreatableSelect from 'react-select/async-creatable';
import { lyricLinesToText, setLyricLines } from '../wLinesUtils'
import { applyNoteSpacingToTune } from '../noteSpacingUtils'
import LyricsSearchButton from './LyricsSearchButton'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

export default function TitleAndLyricsEditorModal({tune, tunebook, token, setBlockKeyboardShortcuts}) {
  const [show, setShow] = useState(false)
  const responsiveModalProps = useResponsiveModalProps()
  const handleClose = () => {
      setShow(false);
  }
  const handleShow = () => setShow(true);

  useEffect(function() {
    if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(show)
    return function() {
      if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(false)
    }
  }, [show, setBlockKeyboardShortcuts])
  var musicBrainz = useMusicBrainz()
  var abcjsParser = useAbcjsParser()
  let params = useParams();

  function saveLyrics(lines) {
    setLyricLines(tune, lines)
    tune.id = params.tuneId
    tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
  }

  function buildLyricsSearchQuery() {
    return [tune.name, tune.composer || '', 'lyrics'].filter(Boolean).join(' ')
  }

  return (
    <>
        <button type="button" className="title-lyrics-edit-trigger" onClick={handleShow}>{tune ? tune.name : ''}</button>
    
        <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>Edit</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button  style={{float:'right'}} variant="success" onClick={handleClose} >OK</Button>
            
            
             <Form.Group className="mb-3" controlId="title">
                        <Form.Label>Title</Form.Label>
                        <Form.Control type="text" placeholder="" value={tune.name ? tune.name : ''} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })  }} />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="composer">
                        <Form.Label>Artist</Form.Label>
                        
                      <AsyncCreatableSelect
                            value={tune && tune.composer ? {value:tune.composer, label:tune.composer} : {value:'', label:''}}
                            onChange={function(val) {if (val) {tune.composer = val.label; tune.id = params.tuneId; tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })  }}}
                            defaultOptions={[]} loadOptions={musicBrainz.artistOptions}
                            isClearable={false}
                            blurInputOnSelect={true}
                            createOptionPosition={"first"}
                            allowCreateWhileLoading={true}
                            loadingMessage ="Loading ..."
                            controlShouldRenderValue={true}
                          />
                      
                      </Form.Group>
                    <Form.Group className="mb-3" controlId="key">
                        <LyricsSearchButton
                          title={tune.name}
                          artist={tune.composer || ''}
                          token={token}
                          onLyrics={function(result) { saveLyrics(result.lines) }}
                        />
                        <a style={{marginRight:'0.2em'}} target="_new" rel="noreferrer" href={'https://www.google.com/search?q=' + encodeURIComponent(buildLyricsSearchQuery())}><Button>{tunebook.icons.externallink}</Button>
                        </a>
                        <Button variant="info" style={{marginLeft:'2em'}} onClick={function() {
                            var start = lyricLinesToText(tune)
                            var clean = abcjsParser.cleanupLyrics(start)
                            saveLyrics(clean.split('\n'))
                        }} >{tunebook.icons.wizard} Clean</Button>
                        <Button variant="info" style={{marginLeft:'0.6em'}} onClick={function() {
                            saveLyrics(applyNoteSpacingToTune(tune))
                        }} >Apply Note Spacing</Button>
                        <textarea value={lyricLinesToText(tune)} onChange={function(e) {saveLyrics(e.target.value.split('\n'))  }} className="title-lyrics-editor-textarea" style={{width:'100%', minHeight:'12em', maxHeight:'50vh'}}  />
                    </Form.Group>

        </Modal.Body> 
        
        
      </Modal>
    </>
  );
}
