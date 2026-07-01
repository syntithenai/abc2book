import {useState} from 'react'
import {Button, Modal, ButtonGroup} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import useYouTubePlaylist, { parseYouTubePlaylistId } from '../useYouTubePlaylist'
import {useNavigate} from 'react-router-dom'

function ImportYouTubeModal(props) {
  const navigate = useNavigate()
  const [show, setShow] = useState(false);
  const [warnings, setWarnings] = useState(null);
  const [successes, setSuccesses] = useState(null);
  const [list, setList] = useState('');
  const [importError, setImportError] = useState(null)
  const [importing, setImporting] = useState(false)
  var [tuneBook, setTuneBook] = useState('')
  var [duplicates, setDuplicates] = useState([])
  var [message, setMessage] = useState(null)
  const {getPlaylistItems} = useYouTubePlaylist()

  const handleClose = () => {
      setMessage(null)
      setList('')
      setImportError(null)
      setDuplicates(null)
      setShow(false);
      if (props.closeParent) props.closeParent()
  }

  const handleShow = () => setShow(true)

  function saveItems(items) {
      return new Promise(function(resolve,reject) {
          if (!Array.isArray(items) || items.length <= 0) {
              resolve()
          } else {
              props.tunebook.utils.loadLocalforageObject('bookstorage_tunes').then(function(t) {
                  var youTubeIds = {}
                  if (t) Object.values(t).forEach(function(tune) {
                      if (tune && Array.isArray(tune.links) && tune.name) {
                          tune.links.forEach(function(link) {
                             var id = props.tunebook.utils.YouTubeGetID(link.link)
                             if (id) {
                                 youTubeIds[id] = tune.id
                             }
                          })
                      }
                  })
                  var linkexists = {}
                  var imported = []
                  items.forEach(function(item) {
                     if (item && item.youtubeId && youTubeIds.hasOwnProperty(item.youtubeId))  {
                         linkexists[item.youtubeId] = item.title
                         var tune = t[youTubeIds[item.youtubeId]]
                         var books = (tune.books  && Array.isArray(tune.books)) ? tune.books : []
                         books.push(props.currentTuneBook)
                         tune.books = props.tunebook.utils.uniquifyArray(books)
                         props.tunebook.saveTune(tune)
                     } else if (item && item.youtubeId) {
                         var newTune = props.tunebook.saveTune({name:item.title, links: [{link: 'https://www.youtube.com/watch?v='+item.youtubeId}], books: [props.currentTuneBook], voices:[]})
                         imported.push(newTune)
                     }
                  })
                  resolve([linkexists, imported])
              })
          }
      })
  }

  function doImport(rawInput) {
      var playlistId = parseYouTubePlaylistId(rawInput)
      if (!playlistId) {
          setImportError('Enter a valid YouTube playlist URL or playlist ID.')
          return
      }
      setImportError(null)
      setImporting(true)
      getPlaylistItems(playlistId, null).then(function(items) {
        setImporting(false)
        if (!Array.isArray(items) || items.length === 0) {
          setImportError('No videos found. Check the playlist URL or ID is correct and the playlist is public.')
          return
        }
        saveItems(items).then(function(res) {
          if (res && res[0] && Object.keys(res[0]).length > 0) {
              setWarnings(Object.keys(res[0]).length + ' items are already in your tune book. These tunes will be associated with the book '+ props.currentTuneBook)
          } else {
              setWarnings(null)
          }
          if (res && res[1]) {
              setSuccesses('Created ' + res[1].length + ' new item(s)')
          } else {
              setSuccesses(null)
          }
        })
      }).catch(function() {
        setImporting(false)
        setImportError('Could not load that playlist. Check the URL or ID and try again.')
      })
  }

  var parsedPlaylistId = parseYouTubePlaylistId(list)
  var canImport = parsedPlaylistId.length > 0 && !importing

  return (
    <>
      <Button  style={{color:'black'}}  variant="primary" onClick={handleShow}>
        {props.tunebook.icons.folderin} YouTube
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import YouTube Playlist</Modal.Title>
        </Modal.Header>
        {(!message) ? <Modal.Body>


          {(warnings || successes) && <div style={{backgroundColor:'lightblue', padding:'0.3em', height:'30em'}} >
              <h3>Import Complete</h3>
              {warnings && <p><b>Warning!!</b> {warnings}</p>}
               {successes && <p>{successes}</p>}
              <br/>
              <Button  onClick={function() {
                 navigate('/blank')
                  setTimeout(function() {
                      navigate('/tunes')
                      handleClose()

                  },500)
               }} variant="success" >Open Book</Button>
            </div>}
          {(!warnings && !successes) && <div style={{backgroundColor:'lightblue', padding:'0.3em', height:'30em'}} >

          <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} >
            Import into &nbsp;&nbsp;
            <ButtonGroup variant="primary"  style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}>{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={tuneBook} onChange={function(val) { ;props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions}   triggerElement={<Button variant="primary" >{props.tunebook.icons.book} {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}</Button>}  /></ButtonGroup>
          </div>
          {props.currentTuneBook ? <>
          <p>Paste a public YouTube playlist URL or playlist ID.</p>
          <input
            placeholder="https://www.youtube.com/playlist?list=PL… or PL…"
            value={list}
            onChange={function(e) {
              setList(e.target.value)
              if (importError) setImportError(null)
            }}
            style={{width:'100%', marginBottom:'0.5em'}}
          />
          {importError && <p style={{color:'crimson'}}>{importError}</p>}

          {canImport
            ? <Button style={{float:'right', marginBottom:'0.5em'}} variant="primary" onClick={function() {doImport(list)}}>Import</Button>
            : <Button style={{float:'right', marginBottom:'0.5em'}} variant="secondary" disabled={importing}>{importing ? 'Importing…' : 'Import'}</Button>}
          </> : ''}
          </div>}


        </Modal.Body> : ''}


        {message &&
        <>
        <Modal.Body>
          {message}
        </Modal.Body>
        <Modal.Footer>
          <Button  variant="success" onClick={handleClose} >OK</Button>
        </Modal.Footer>
        </>
        }
      </Modal>
    </>
  );
}
export default ImportYouTubeModal
