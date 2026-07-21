import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup, ButtonGroup} from 'react-bootstrap'
import VoiceFillInput from './VoiceFillInput'

function GenreSearchSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState(Array.isArray(props.value) ? props.value : []);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions())

  useEffect(function() {
    setSelectedGenres(Array.isArray(props.value) ? props.value : [])
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

    function selectGenre(genre) {
      var newValue = Array.isArray(selectedGenres) ? selectedGenres : []
      newValue.push(genre)
      var uniqueGenresSelected = props.tunebook.utils.uniquifyArray(newValue)
      setFilter('')
      setOptions(props.defaultOptions())
            setSelectedGenres(uniqueGenresSelected)
            props.onChange(uniqueGenresSelected)
            handleClose()
      }

    function deselectGenre(genre) {
      var uniqueGenresSelected = selectedGenres.filter(function(selectedGenre) {
        if (selectedGenre === genre) {
          return false
        } else {
          return true
        }
      })
      setSelectedGenres(uniqueGenresSelected)
    }

    var sortedOptions = Object.keys(options);
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  const hasActiveGenres = Array.isArray(props.value) && props.value.length > 0
  const hideSelection = !!props.hideSelection

  function clearGenreFilter(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setSelectedGenres([])
    props.onChange([])
    props.forceRefresh()
  }

  return (
    <>
      <ButtonGroup>
        <Button onClick={handleShow} variant="info" >
          <span>
            {props.tunebook.icons.genre}
            {hideSelection
              ? <span className="tune-search-filters-btn-label"> Genre</span>
              : (Array.isArray(props.value) ? ' ' + props.value.map(function(v) { return String(v).toLowerCase() }).join(",") : '')}
          </span>
        </Button>
        {!hideSelection && hasActiveGenres ? (
          <Button variant="info" title="Clear genre filter" onClick={clearGenreFilter}>
            {props.tunebook.icons.closecircle}
          </Button>
        ) : null}
      </ButtonGroup>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Filter Genres </Modal.Title>

        </Modal.Header>
        <Modal.Body >

        <div style={{width:'100%', borderBottom:'1px solid black'}} ><Button style={{marginBottom:'0.3em'}} onClick={function() {setSelectedGenres([]); props.onChange([]) ;handleClose()}} variant="warning">Reset Search</Button></div>
          <Button onClick={function() {handleClose()}} variant="danger" style={{float:'right', marginBottom:'0.3em'}}>Cancel</Button>
          <Button onClick={function() {props.onChange(selectedGenres); handleClose()}} variant="success" style={{float:'right', marginBottom:'0.3em'}}>Search</Button>


          <div>{Array.isArray(selectedGenres) && selectedGenres.map(function(selectedGenre) {
              return <Button key={selectedGenre} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectGenre(selectedGenre)}} >{props.tunebook.icons.closecircle}&nbsp;{String(selectedGenre).toLowerCase()}</Button>
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
          {(Array.isArray(sortedOptions) && sortedOptions.length === 0) && <Button onClick={function() {selectGenre(filter)} } >Set</Button>}
        </Modal.Body>
        <Modal.Footer  >
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectGenre(option)}} >{String(options[option]).toLowerCase()}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default GenreSearchSelectorModal
