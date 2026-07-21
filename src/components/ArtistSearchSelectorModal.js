import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup, ButtonGroup} from 'react-bootstrap'
import VoiceFillInput from './VoiceFillInput'

function ArtistSearchSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState(Array.isArray(props.value) ? props.value : []);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions())

  useEffect(function() {
    setSelectedArtists(Array.isArray(props.value) ? props.value : [])
  }, [props.value])

  const handleClose = () => {
      setShow(false);
      if (props.handleClose) props.handleClose()
  }
  const handleShow = () => setShow(true);

  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value.toLowerCase())
    if (e.target.value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout)
      filterChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(e.target.value))
      },500)
    }
  }

    function selectArtist(artist) {
      var newValue = Array.isArray(selectedArtists) ? selectedArtists : []
      newValue.push(artist)
      var uniqueArtistsSelected = props.tunebook.utils.uniquifyArray(newValue)
      setFilter('')
      setOptions(props.defaultOptions())
            setSelectedArtists(uniqueArtistsSelected)
            props.onChange(uniqueArtistsSelected)
            handleClose()
      }

    function deselectArtist(artist) {
      var uniqueArtistsSelected = selectedArtists.filter(function(selectedArtist) {
        if (selectedArtist === artist) {
          return false
        } else {
          return true
        }
      })
      setSelectedArtists(uniqueArtistsSelected)
    }

    var sortedOptions = Object.keys(options);
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  const hasActiveArtists = Array.isArray(props.value) && props.value.length > 0
  const hideSelection = !!props.hideSelection

  function clearArtistFilter(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setSelectedArtists([])
    props.onChange([])
    props.forceRefresh()
  }

  return (
    <>
      <ButtonGroup>
        <Button onClick={handleShow} variant="info" >
          <span>
            {props.tunebook.icons.artist}
            {hideSelection
              ? <span className="tune-search-filters-btn-label"> Artist</span>
              : (Array.isArray(props.value) ? ' ' + props.value.map(function(v) { return String(v).toLowerCase() }).join(",") : '')}
          </span>
        </Button>
        {!hideSelection && hasActiveArtists ? (
          <Button variant="info" title="Clear artist filter" onClick={clearArtistFilter}>
            {props.tunebook.icons.closecircle}
          </Button>
        ) : null}
      </ButtonGroup>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Filter Artists </Modal.Title>

        </Modal.Header>
        <Modal.Body >

        <div style={{width:'100%', borderBottom:'1px solid black'}} ><Button style={{marginBottom:'0.3em'}} onClick={function() {setSelectedArtists([]); props.onChange([]) ;handleClose()}} variant="warning">Reset Search</Button></div>
          <Button onClick={function() {handleClose()}} variant="danger" style={{float:'right', marginBottom:'0.3em'}}>Cancel</Button>
          <Button onClick={function() {props.onChange(selectedArtists); handleClose()}} variant="success" style={{float:'right', marginBottom:'0.3em'}}>Search</Button>


          <div>{Array.isArray(selectedArtists) && selectedArtists.map(function(selectedArtist) {
              return <Button key={selectedArtist} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectArtist(selectedArtist)}} >{props.tunebook.icons.closecircle}&nbsp;{String(selectedArtist).toLowerCase()}</Button>
            })}</div>

          <VoiceFillInput
            layout="wrap"
            useFormControl={false}
            type="search"
            value={filter}
            onChange={filterChange}
            onFocus={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)}}
            onBlur={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)}}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            token={props.token}
            fieldKind="search"
          />
          {(Array.isArray(sortedOptions) && sortedOptions.length === 0) && <Button onClick={function() {selectArtist(filter)} } >Set</Button>}
        </Modal.Body>
        <Modal.Footer  >
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectArtist(option)}} >{String(options[option]).toLowerCase()}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default ArtistSearchSelectorModal
