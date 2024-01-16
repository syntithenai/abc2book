import { pdfjs } from 'react-pdf';
import { Document, Page, Outline } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';  
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {useState, useEffect, useRef} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import useWindowSize from '../useWindowSize'
import utilsFunctions from '../utilsFunctions' 
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString(); 


export default function PDFViewer(props) {
	var windowSize = useWindowSize()
	var utils = utilsFunctions()
	const [numPages, setNumPages] = useState();
	const [searchFor, setSearchFor] = useState('');
	const [pageNumber, setPageNumber] = useState(1);
	const [searchTimeout, setSearchTimeout] = useState(1);
	const [searchActive, setSearchActive] = useState(false);
	const [searchResults, setSearchResults] = useState(false);
	const [showIndex, setShowIndex] = useState(false);
	
	function search(searchText) {
		//console.log('SEARCH '+ searchText)
		if (searchText.trim().length > 1) { 
			setSearchActive(true)
			
			function searchPage(doc, pageNumber) {
			  return doc.getPage(pageNumber).then(function (page) {
				  //console.log(page)
				return page.getTextContent();
			  }).then(function (content) {
				// Search combined text content using regular expression
				var text = content.items.map(function (i) { return i.str; }).join('');
				//console.log(text)
				var re = new RegExp("(.{0,20})" + searchText.trim() + "(.{0,20})", "gi"), m;
				var lines = [];
				while (m = re.exec(text)) {
				  var line = (m[1] ? "..." : "") + m[0] + (m[2] ? "..." : "");
				  lines.push(line);
				}
				//if (lines.length > 0) console.log(lines)
				return {page: pageNumber, items: lines};
			  });
			}

			var loading = pdfjs.getDocument(props.src);
			loading.promise.then(function (doc) {
				//console.log(doc)
			  var results = [];
			  for (var i = 1; i <= doc.numPages; i++)
				results.push(searchPage(doc, i));
			    return Promise.all(results);
			}).then(function (results) {
				if (results) {
					setSearchResults(results.filter(function(a) { return a.items.length > 0}))
					setSearchActive(false)
					utils.scrollTo('scrollmarker')
				}
			}).catch(console.error);
		}  else {
			setSearchResults([])
		} 
		
	}
	function handleCloseIndex() {
		setShowIndex(false)
	}
	
	function handleClose() {
		setSearchResults([])
	}

	function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
		setNumPages(numPages);
	}
	
	function onItemClick({ pageNumber: itemPageNumber }) {
		setPageNumber(itemPageNumber);
		handleCloseIndex()
	}
	
	function nextPage() {
		var n = pageNumber < numPages ? pageNumber + 1 : numPages
		setPageNumber(n)
	}
	
	function previousPage() {
		var n = pageNumber >= 2 ? pageNumber - 1 : 1
		setPageNumber(n)
	}
	
	return <div>
		{<Document file={props.src} onLoadSuccess={onDocumentLoadSuccess}>
		<div id='scrollmarker' ></div>
		<div className='pdfsearchbox' id='pdfsearchbox' style={{height:((windowSize[0] < 500) ? '6em' : '3em'), padding:'0.2em', border:'1px solid black', backgroundColor:'lightgrey'}} >
			 
			&nbsp;<Button  onClick={function() {setShowIndex(true)}} >{props.tunebook.icons.menu}</Button>&nbsp;&nbsp; 
			<>
		  <Modal  style={{minWidth:'500px'}} show={(showIndex)} onHide={handleCloseIndex}>
			<Modal.Header closeButton>
			  <Modal.Title>Document Index</Modal.Title>
			</Modal.Header>
			<Modal.Body>
			  <div style={{width:'100%'}} >
				
				 
				  <div style={{width:'100%', clear:'both', paddingTop:'1em'}} >
					<Outline onItemClick={onItemClick} />
				</div>
			  </div>
			</Modal.Body>
		  </Modal>
		</>
			
			 
			 <input type='text' style={{width:'8em'}} value={searchFor} onChange={function(e) {
				 setSearchFor(e.target.value)
				 clearTimeout(searchTimeout)
				 setSearchTimeout(setTimeout(function() { search(e.target.value)}, 500))
			 }} />
			 
			&nbsp;<Button variant="danger" onClick={function() {setSearchFor('')}} >{props.tunebook.icons.closecircle }</Button>&nbsp;&nbsp; 
			 
			 {searchActive && <span> Loading</span>}
			 
			 <div style={{float:'right'}} >
				 <Button onClick={previousPage} >{}Prev</Button>&nbsp;&nbsp;&nbsp;
				  
				 <input type='number' value={pageNumber} onChange={function(e) {setPageNumber(parseInt(e.target.value))}} style={{width:'4em'}} /> of {numPages}
				 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Button onClick={nextPage} >{}Next</Button>
			</div>
		</div>
		
		
		<>
		  <Modal  style={{minWidth:'500px'}} show={(searchResults.length > 0)} onHide={handleClose}>
			<Modal.Header closeButton>
			  <Modal.Title>Search Results</Modal.Title>
			</Modal.Header>
			<Modal.Body>
			  <div style={{width:'100%'}} >
				
				 
				  <div style={{width:'100%', clear:'both', paddingTop:'1em'}} >
					 <ListGroup className="searchresults">
					{Array.isArray(searchResults) && searchResults.map(function(result, rk) {
					  return <ListGroup.Item onClick={function(e) {  setPageNumber(parseInt(result.page)); handleClose()}} className={rk %2 === 1 ? 'odd' : 'even'} key={rk} >
						<div><b>{result.items.join(" ")}</b> </div>
						
					</ListGroup.Item>
				  
					})}
				  </ListGroup>
				  
				</div>
			  </div>
			</Modal.Body>
		  </Modal>
		</>
		
		
		
			<Page pageNumber={pageNumber} width={props.width > 0 ? props.width : windowSize[0]} />
				{(props.showPages > 0 && Math.min(parseInt(props.showPages - 1), (numPages - pageNumber)) > 0) && <>{Array(Math.min(parseInt(props.showPages) - 1, (numPages - pageNumber))).fill(null).map(function(n,p) {
				return <Page pageNumber={(pageNumber + parseInt(p) + 1)} width={windowSize[0]} />
			})}</>}
		</Document>}
		
	</div>
	
}
	
//
			
