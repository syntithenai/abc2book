/* global QRCode */
import { Link , useParams } from 'react-router-dom'
import {Button, Modal, Form, Col, Row, Container} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import AbcPrint from '../components/AbcPrint'
import useAbcjsParser from '../useAbcjsParser'
//import useQRCode from '../useQRCode'
// TODO DIALOG FOR OPTIONS - SHOW NOTATION, SHOW CHORDS, ...
export default function PrintPage(props) {
    var params = useParams()
    //var [refs , setRefs] = useState([])
    var [useTunes , setUseTunes] = useState(null)
    var [useQR , setUseQR] = useState(true)
    var [option , setOption] = useState('auto')
    const [show, setShow] = useState(false);
    const [selectedCount, setSelectedCount] = useState(false);
    const [showLyrics, setShowLyrics] = useState(true);
    const [showNotationOrChords, setShowNotationOrChords] = useState(1);  // 0 none, 1 notation, 2 chords, 3 both
    //const [showNotation, setShowNotation] = useState(true);
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    //const QRCode = useQRCode(props)
    
	const handleClose = () => {
		setShow(false);
	}
	const handleShow = (e) => {
		setShow(true);
	}
	
	function createQRCodes(useTunes) {
		if (useQR) {
			console.log('CREATE CODES')
			useTunes.forEach(function(tune) {
				if (tune.links && tune.links.length > 0 && tune.links[0].link) { 
					var div = document.getElementById("qrcode_"+tune.id)
					try {	
						while(div.firstChild && div.removeChild(div.firstChild));
					} catch (e) {}
					console.log('Cleared CODE')
					console.log('CREATE CODE',tune.id,tune.links[0].link, document.getElementById("qrcode_"+tune.id))
					new QRCode(document.getElementById("qrcode_"+tune.id), {
						text: tune.links[0].link,
						width: 128,
						height: 128,
						colorDark : "#000000",
						colorLight : "#ffffff",
						correctLevel : QRCode.CorrectLevel.H
					})
				}
			})
		}
	}
	
	function printMe() {
		console.log('PRINTME')
		handleClose()
		setTimeout(function() {
			window.print()
		},200)
	}

	function goBack() {
		window.history.back()
	}
  
    useEffect(function() {
		// IF params.tuneBook, use that 
		// ELSE IF props.selected, use that
        if (params.tuneBook) {
			var tmp = props.tunebook.fromBook(params.tuneBook).map(function(tune) {
				return tune
			})
			setUseTunes(tmp)
			setSelectedCount(tmp.length)
			handleShow()
			setTimeout(function() {
				createQRCodes(tmp)
			},200)
			//if (tmp.length > 0) window.print()
		} else {
			var selectedIds = Object.keys(props.selected)
			if (selectedIds.length > 0) {
				var tmp = []
				selectedIds.forEach(function(tuneId) {
					if (props.selected[tuneId] && props.tunes[tuneId]) {
						tmp.push(props.tunes[tuneId])
					}
				})
				setUseTunes(tmp)
				setSelectedCount(tmp.length)
				handleShow()
				setTimeout(function() {
					createQRCodes(tmp)
					
				},200)
				//if (tmp.length > 0) window.print()
			} else {
				setUseTunes([])
				setSelectedCount(0)
			}
		}
		
    },[params.tuneBook, props.tunes, props.selected,useQR])
    return <div className="App-print">
    
   

      <Modal show={show} onHide={goBack}>
        <Modal.Header closeButton>
          <Modal.Title>Print {selectedCount} selected tunes ..</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <div style={{clear:'both', width:'100%', minHeight:'4em'}} className="mb-3" >
			   <Form>
					<Form.Check id="auto" checked={(option === 'auto' ? true : false)}  onChange={function() {setOption('auto')}} type='radio' label='Automatic'  />
					<Form.Check id="justnotation" checked={(option === 'justnotation' ? true : false)}  onChange={function() {setOption('justnotation')}} type='radio' label='Notation Only' inline={true} />
					<Form.Check id="justlyrics" checked={(option === 'justlyrics' ? true : false)}  onChange={function() {setOption('justlyrics')}} type='radio' label='Lyrics Only' inline={true} />
					<Form.Check id="justchords" checked={(option === 'justchords' ? true : false)}  onChange={function() {setOption('justchords')}} type='radio' label='Chords Only' inline={true} />
					<Form.Check id="chordsandlyrics" checked={(option === 'chordsandlyrics' ? true : false)}  onChange={function() {setOption('chordsandlyrics')}} type='radio' label='Chords And Lyrics' inline={true} />
					<Form.Check id="notationandlyrics" checked={(option === 'notationandlyrics' ? true : false)}  onChange={function() {setOption('notationandlyrics')}} type='radio' label='Notation And Lyrics' inline={true} />
					<hr/>
					<Form.Check type={'checkbox'}   id={`useqr`} >
						<Form.Check.Input type={'checkbox'}  onChange={function() {setUseQR(!useQR)}} checked={useQR ? true : false} />
						<Form.Check.Label>&nbsp;&nbsp;&nbsp;{` Add QR code for playable links`}</Form.Check.Label>
					</Form.Check>
					<hr/>
					  
				  <div style={{marginTop:'2em', paddingBottom:'1em'}} >
					   <Button key="a" variant="success" onClick={printMe}>
						Print
					  </Button>
					  <Button style={{float:'right'}} key="b" variant="danger" onClick={goBack}>
						Cancel
					  </Button>
				  </div>    
			  
			  </Form>
          </div>    
         
        </Modal.Body>

      </Modal>
    
      {(useTunes === null) && <div>Loading ....</div>}
      {(useTunes!== null && useTunes.length == 0) && <div>No tunes selected to print</div>}
      {(useTunes!== null && useTunes.length > 0) && useTunes.map(function(tune) {
            var words = {}
            var current = 0
            if (Array.isArray(tune.words)) {
                tune.words.forEach(function(line) {
                  if (line && line.trim().length > 0) {
                      if (!Array.isArray(words[current])) words[current] = []
                      words[current].push(line)
                  } else {
                      current++
                  }
                })
            } 
            var firstVoice = tune.voices && Object.keys(tune.voices).length > 0 ? Object.values(tune.voices)[0] : {notes:[]}
			var chords = abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), true, tune.transpose, tune.key, tune.noteLength, tune.meter)
            var cleanNotes = firstVoice.notes.join("\n").replace(/"([^"]+(?="))"/g, '').replace(/z/g, '').replace(/\|/g, '')
            var hasNotes = cleanNotes.trim().length > 0 ? true : false
            //console.log(cleanNotes,hasNotes)
            
            
            return (true || !show) ? <div  key={(tune ? tune.id : '')} >
				
				{(useQR ? true : false) && <div style={{float:'left', clear:'right'}} id={"qrcode_" + tune.id} ></div>}
				
				{((option === "auto" && !hasNotes) || option === "justchords" || option === "justlyrics" || option === "chordsandlyrics"  ) && <div style={{marginBottom:'1.2em', clear:'both'}}>
					{(tune.composer) && <div className="composer" style={{float:'right'}} >{tune.composer}</div>}
					{<div className="title" style={{textAlign:'center', fontSize:'1.7em', fontFamily:'serif'}} >{tune.name}</div>}
				</div>}
				
				{((option === "auto" && hasNotes) || option === "justnotation" || option === "notationandlyrics" ) && <AbcPrint abc={props.tunebook.abcTools.json2abc_print(tune)} tunebook={props.tunebook} tune={tune} />}
				
				{((option === "auto" && !hasNotes) || option === "justchords" || option === "chordsandlyrics") && <div classname='chordsblock' style={{display:'block', clear:'both'}}>
				<Container fluid style={{ fontSize:'large' , padding:'0.3em', lineHeight:'2em', marginTop:'1em'}} >{chords.split("\n").map(function(line) {
					return (line && line.trim().length > 0) ?  <Row style={{borderBottom:'1px solid black'}} >{line.split("|").map(function(bar) {
						return (bar && bar.trim().length > 0) ? <Col style={{borderRight:'1px solid black'}} >{bar}</Col> : null
					})}</Row> : <Row>&nbsp;</Row>
				})}</Container></div> }
				
            	
				{(option === "auto" || option === "justlyrics"  || option === "chordsandlyrics" || option === "notationandlyrics" ) && <div className="lyrics" style={{marginLeft:'2em', clear:'both'}} >
					{Object.keys(words).map(function(key) {
						return <div key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line, lk) {
								return <div key={lk} className="lyrics-line" >{line}</div>
							})}</div>
					})}
				</div>}
			</div> : null
		})}
    

    </div>
}
    
