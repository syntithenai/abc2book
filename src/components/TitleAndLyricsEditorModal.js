import {useState, useEffect} from 'react'
import {Button, Modal, Form} from 'react-bootstrap'
import { chordParserFactory, chordRendererFactory } from 'chord-symbol';
import useMusicBrainz from '../useMusicBrainz'
import useAbcjsParser from '../useAbcjsParser'
import {useParams} from 'react-router-dom'
import AsyncCreatableSelect from 'react-select/async-creatable';

export default function TitleAndLyricsEditorModal({tune, tunebook}) {
  
  const [show, setShow] = useState(false)
  const handleClose = () => {
      setShow(false);
  }
  const handleShow = () => setShow(true);
  var musicBrainz = useMusicBrainz()
  var abcjsParser = useAbcjsParser()
  let params = useParams();
  return (
    <>
        <span onClick={handleShow} style={{fontWeight:'bold'}} >{tune ? tune.name : ''}</span>
    
        <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Edit</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button  style={{float:'right'}} variant="success" onClick={handleClose} >OK</Button>
            
            
             <Form.Group className="mb-3" controlId="title">
                        <Form.Label>Title</Form.Label>
                        <Form.Control type="text" placeholder="" value={tune.name ? tune.name : ''} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; tunebook.saveTune(tune)  }} />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="composer">
                        <Form.Label>Artist</Form.Label>
                        
                      <AsyncCreatableSelect
                            value={tune && tune.composer ? {value:tune.composer, label:tune.composer} : {value:'', label:''}}
                            onChange={function(val) {if (val) {tune.composer = val.label; tune.id = params.tuneId; tunebook.saveTune(tune)  }}}
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
                        <a target="_new" href={"https://www.google.com/search?q=lyrics "+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button>Search Lyrics</Button></a>
                        <a target="_new" href={"https://www.google.com/search?q=chords " + '"' +tune.name + '"' + ' '+(tune.composer ?  tune.composer : '')  +  " " + tunebook.allowedChordSites} ><Button>Search Chords</Button></a>
                        <a style={{marginRight:'0.2em'}}  target="_new" href={"https://www.youtube.com/results?search_query="+tune.name + ' '+(tune.composer ? tune.composer : '')+ ' '+(tune.rhythm ? tune.rhythm : '')} ><Button>{tunebook.icons.externallink}</Button>
                        </a>
                        <Button variant="info" style={{marginLeft:'2em'}} onClick={function() {
                            var start = (Array.isArray(tune.words) ? tune.words.join("\n") : '')
                            var clean = abcjsParser.cleanupLyrics(start)
                            //console.log(clean)
                            tune.words = clean.split("\n")
                            tune.id = params.tuneId
                            tunebook.saveTune(tune)
                        }} >{tunebook.icons.wizard} Clean</Button>
                        <textarea value={Array.isArray(tune.words) ? tune.words.join("\n") : ''} onChange={function(e) {tune.words = e.target.value.split("\n"); tune.id = params.tuneId; tunebook.saveTune(tune)  }} style={{width:'100%', height:'30em'}}  />
                    </Form.Group>

        </Modal.Body> 
        
        
      </Modal>
    </>
  );
}
//  
